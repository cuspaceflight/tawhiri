# Copyright 2014 (C) Daniel Richman
#
# This file is part of Tawhiri.
#
# Tawhiri is free software: you can redistribute it and/or modify
# it under the terms of the GNU General Public License as published by
# the Free Software Foundation, either version 3 of the License, or
# (at your option) any later version.
#
# Tawhiri is distributed in the hope that it will be useful,
# but WITHOUT ANY WARRANTY; without even the implied warranty of
# MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
# GNU General Public License for more details.
#
# You should have received a copy of the GNU General Public License
# along with Tawhiri.  If not, see <http://www.gnu.org/licenses/>.

"""
Wind :class:`tahwiri.wind.Dataset` Downloader

Downloaded data arrives in `GRIB <http://en.wikipedia.org/wiki/GRIB>`_
format, although three quarters of the records in the downloaded file are
ignored. The records that are used can also be written to a new grib file
as they are unpacked (which is therefore somewhat smaller, as it is
still compressed and only contains the useful bits).
"""


from __future__ import division

import logging
import logging.handlers
import argparse
import sys
import os
import os.path
import errno
import shutil
import math
import tempfile
from collections import namedtuple
from time import time
from datetime import datetime, timedelta
from socket import inet_ntoa
import gevent.local
from gevent import sleep
from gevent import greenlet
from gevent.timeout import Timeout
from gevent.event import Event
from gevent.pool import Group
from gevent.queue import PriorityQueue
from gevent.dns import resolve_ipv4
from gevent.coros import RLock
import gevent.socket
import ftplib
import itertools
import numpy as np
import pygrib
from six import reraise

from .dataset import Dataset


__all__ = ["DatasetDownloader", "DownloadDaemon", "main", "unpack_grib"]


logger = logging.getLogger("tawhiri.downloader")


assert Dataset.element_type == 'float32'
assert Dataset.axes._fields[0:3] == ("hour", "pressure", "variable")


def make_checklist():
    """
    Create a matrix of bools with dimensions ``Dataset.shape[0:3]``

    ... i.e., a element for every GRIB record we need when downloading
    a new dataset
    """
    return np.zeros(Dataset.shape[0:3], dtype=np.bool_)


_grib_name_to_variable = {"Geopotential Height": "height",
                          "U component of wind": "wind_u",
                          "V component of wind": "wind_v"}

def unpack_grib(filename, dataset=None, checklist=None, gribmirror=None,
                assert_hour=None, file_checklist=None, callback=None):
    """
    Unpack the GRIB file at `filename`

    ... into `dataset`

    ... setting the cell corresponding to each GRIB record in `checklist`
        to ``True`` (see :meth:`make_checklist`)

    ... copying the GRIB records we care about into `gribmirror`

    ... checking that the `forecastTime` matches `assert_hour`

    ... checking that the GRIB records in this file (that we care about)
        exactly match the set of ``(forecast time, level, variable)`` tuples
        in `file_checklist`

    ... calling `callback` after processing each record, with arguments
        ``(pass, location indices, location names)`` (where location is
        ``(forecast time, level, variable)``)

    `callback` must _not_ edit `dataset`, `checklist` or `gribmirror`,
    or yield to a greenlet that will
    (hence :attr:`DownloadDaemon.unpack_lock`).

    `callback` is mainly used to yield to other greenlets doing IO
    (i.e., downloading other files) while we do the CPU intensive task of
    unpacking GRIB data.

    The data is unpacked in two passes; the first

    * checks the shape and forecast time of each record,
    * checks the axes of the first record (i.e., the latitudes and
      longitudes each point corresponds to) - this is really slow,
      so is only done once,
    * checks the contents of the file exactly matches `file_checklist`
      (excluding records we don't care about),
    * checks that no elements of `checklist` that we're about to unpack
      are already marked as having been unpacked (i.e., ``True``).

    The second pass copies the data in each record to its correct
    location in `dataset`, writes a copy to `gribmirror` and marks
    the correct place in `checklist` as True.

    :exc:`ValueError` is raised in case of any problems.
    """

    # callback must _not_ edit dataset/checklist/gribmirror
    # or yield to a greenlet that will (see DownloadDaemon.unpack_lock)

    if dataset is not None:
        dataset_array = \
                np.ndarray(shape=Dataset.shape, dtype=np.float32,
                           buffer=dataset.array, offset=0, order='C')
    else:
        dataset_array = None

    if file_checklist is not None:
        file_checklist = file_checklist.copy()

    grib = pygrib.open(filename)
    try:
        # pass one: check the contents of the file
        _check_grib_file(grib, filename, dataset_array, checklist,
                         assert_hour, file_checklist, callback)

        # pass two: unpack
        for record, location, location_name in _grib_records(grib):
            if dataset_array is not None:
                # the fact that latitudes are reversed here must match
                # check_axes!
                t, p, v = location
                dataset_array[t,p,v,::-1,:] = record.values
            if gribmirror is not None:
                gribmirror.write(record.tostring())
            if checklist is not None:
                checklist[location] = True

            logger.debug("unpacked %s %s %s",
                         filename, location_name, location)

            if callback is not None:
                callback(True, location, location_name)

        logger.info("unpacked %s", filename)
    finally:
        grib.close()

def _check_grib_file(grib, filename, dataset_array, checklist,
                     assert_hour, file_checklist, callback):
    """
    The first pass over the GRIB file, checking its contents

    * checks the shape and forecast time of each record,
    * checks the axes of the first record (i.e., the latitudes and
      longitudes each point corresponds to) - this is really slow,
      so is only done once,
    * checks the contents of the file exactly matches `file_checklist`
      (excluding records we don't care about),
    * checks that no elements of `checklist` that we're about to unpack
      are already marked as having been unpacked (i.e., ``True``).
    """

    checked_axes = False

    for record, location, location_name in _grib_records(grib):
        _check_record(record, location, location_name,
                      checklist, assert_hour, file_checklist)
        if file_checklist is not None:
            file_checklist.remove(location_name)

        # Checking axes (for some reason) is really slow, so do it once as
        # a small sanity check, and hope that if it's OK for one record,
        # they haven't changed things and the other records will be OK
        if not checked_axes:
            _check_axes(record)
            checked_axes = True

        if dataset_array is not None and \
                dataset_array[location].shape != record.values.shape:
            raise ValueError("record values had incorrect shape")

        logger.debug("checked %s %s %s", filename, location_name, location)

        if callback is not None:
            callback(False, location, location_name)

    if file_checklist != set():
        raise ValueError("records missing from file")

def _grib_records(grib):
    """
    Yield ``(record, location, location_name)`` tuples in the file `grib`

    ... where location and location_name are tuples containing indicies
        or actual axes names/values corresponding to forecast time, level
        and variable.

        e.g., ``(4, 2, 1)`` ``(12, 950, "wind_u")`` (i.e., 12 hours, 950 mb)

    Records that don't have levels specified as pressure, or are not
    variables that we are interested in, are ignored.
    """

    grib.seek(0)
    for record in grib:
        if record.typeOfLevel != "isobaricInhPa":
            continue
        if record.name not in _grib_name_to_variable:
            continue

        location_name = (record.forecastTime, record.level,
                         _grib_name_to_variable[record.name])

        location = tuple(Dataset.axes[i].index(n)
                         for i, n in enumerate(location_name))

        yield record, location, location_name

def _check_record(record, location, location_name,
                  checklist, assert_hour, file_checklist):
    """
    Check that this record

    ... has not already been unpacked, i.e., ``checklist[location]`` is not
        set

    ... is for the correct forecast time
        (i.e., ``forecastTime == assert_hour``)

    ... is expected for this file (i.e., ``location_name in file_checklist``)
    """

    if checklist is not None and checklist[location]:
        raise ValueError("record already unpacked (from other file): {0}"
                            .format(location_name))
    if assert_hour is not None and record.forecastTime != assert_hour:
        raise ValueError("Incorrect forecastTime (assert_hour)")
    if file_checklist is not None and location_name not in file_checklist:
        raise ValueError("unexpected record: {0}".format(location_name))

def _check_axes(record):
    """
    Check the axes on `record` match what we expect

    i.e., that the latitudes and longitudes are -90 to 90 /
    0 to 360 respectively in 0.5 degree increments.
    """

    # The fact that latitudes is reversed here must match unpack_grib!
    if not np.array_equal(record.distinctLatitudes[::-1],
                          Dataset.axes.latitude):
        raise ValueError("unexpected axes on record (latitudes)")
    if not np.array_equal(record.distinctLongitudes,
                          Dataset.axes.longitude):
        raise ValueError("unexpected axes on record (longitudes)")

class FTP(ftplib.FTP):
    """gevent-friendly :class:`ftplib.FTP`"""

    def connect(self, host=None, port=None, timeout=None):
        if host is not None:
            self.host = host
        if port is not None:
            self.port = port
        if timeout is not None:
            self.timeout = timeout

        self.sock = gevent.socket.create_connection(
                (self.host, self.port), self.timeout)
        self.af = self.sock.family
        self.file = self.sock.makefile('rb')
        self.welcome = self.getresp()
        return self.welcome

    def makeport(self):
        raise NotImplementedError

    def ntransfercmd(self, cmd, rest=None):
        assert self.passiveserver

        host, port = self.makepasv()
        conn = gevent.socket.create_connection((host, port), self.timeout)

        try:
            if rest is not None:
                self.sendcmd("REST %s" % rest)
            resp = self.sendcmd(cmd)
            if resp[0] == '2':
                resp = self.getresp()
            if resp[0] != '1':
                raise ftplib.error_reply(resp)
        except:
            conn.close()
            raise

        if resp[:3] == '150':
            size = ftplib.parse150(resp)

        return conn, size


class NotFound(Exception):
    """A GRIB file wasn't found"""

class BadFile(Exception):
    """A GRIB file was retrieved, but its contents were bad"""


class DatasetDownloader(object):
    _queue_item_type = namedtuple("queue_item",
                                    ("hour", "sleep_until", "filename",
                                     "expect_pressures", "bad_downloads"))

    filename_pattern = \
            "gfs.t{ds_hour}z.pgrb2{pressure_flag}.0p50.f{axis_hour:03}"

    def __init__(self, directory, ds_time, timeout=120,
                 first_file_timeout=600,
                 bad_download_retry_limit=3,
                 write_dataset=True, write_gribmirror=True,
                 deadline=None,
                 dataset_host="ftp.ncep.noaa.gov",
                 dataset_path="/pub/data/nccf/com/gfs/prod/gfs.{0}/"):

        # set these ASAP for close() via __del__ if __init__ raises something
        self.success = False
        self._dataset = None
        self._gribmirror = None
        self._tmp_directory = None

        assert ds_time.hour in (0, 6, 12, 18)
        assert ds_time.minute == ds_time.second == ds_time.microsecond == 0

        if not (write_dataset or write_gribmirror):
            raise ValueError("Choose write_datset or write_gribmirror "
                                "(or both)")

        if deadline is None:
            deadline = max(datetime.now() + timedelta(hours=2),
                           ds_time + timedelta(hours=9, minutes=30))

        self.directory = directory
        self.ds_time = ds_time

        self.timeout = timeout
        self.first_file_timeout = first_file_timeout
        self.write_dataset = write_dataset
        self.write_gribmirror = write_gribmirror
        self.bad_download_retry_limit = bad_download_retry_limit

        self.deadline = deadline
        self.dataset_host = dataset_host
        self.dataset_path = dataset_path

        self.have_first_file = False

        self.files_complete = 0
        self.files_count = 0
        self.completed = Event()

        ds_time_str = self.ds_time.strftime("%Y%m%d%H")
        self.remote_directory = dataset_path.format(ds_time_str)

        self._greenlets = Group()
        self.unpack_lock = RLock()

        # Items in the queue are
        #   (hour, sleep_until, filename, ...)
        # so they sort by hour, and then if a not-found adds a delay to
        # a specific file, files from that hour without the delay
        # are tried first
        self._files = PriorityQueue()

        # areas in self.dataset.array are considered 'undefined' until
        #   self.checklist[index[:3]] is True, since unpack_grib may
        #   write to them, and then abort via ValueError before marking
        #   updating the checklist if the file turns out later to be bad

        # the checklist also serves as a sort of final sanity check:
        #   we also have "does this file contain all the records we think it
        #   should" checklists; see Worker._download_file

        self._checklist = make_checklist()

    def open(self):
        logger.info("downloader: opening files for dataset %s", self.ds_time)

        self._tmp_directory = \
                tempfile.mkdtemp(dir=self.directory, prefix="download.")
        os.chmod(self._tmp_directory, 0o775)
        logger.debug("Temporary directory is %s", self._tmp_directory)

        if self.write_dataset:
            self._dataset = \
                Dataset(self.ds_time, directory=self._tmp_directory, new=True)

        if self.write_gribmirror:
            fn = Dataset.filename(self.ds_time,
                                  directory=self._tmp_directory,
                                  suffix=Dataset.SUFFIX_GRIBMIRROR)
            logger.debug("Opening gribmirror (truncate and write) %s %s",
                                self.ds_time, fn)
            self._gribmirror = open(fn, "w+")

    def download(self):
        logger.info("download of %s starting", self.ds_time)

        ttl, addresses = resolve_ipv4(self.dataset_host)
        logger.debug("Resolved to %s IPs", len(addresses))

        addresses = [inet_ntoa(x) for x in addresses]

        total_timeout = self.deadline - datetime.now()
        total_timeout_secs = total_timeout.total_seconds()
        if total_timeout_secs < 0:
            raise ValueError("Deadline already passed")
        else:
            logger.debug("Deadline in %s", total_timeout)

        self._add_files()
        self._run_workers(addresses, total_timeout_secs)

        if not self.completed.is_set():
            raise ValueError("timed out")

        if not self._checklist.all():
            raise ValueError("incomplete: records missing")

        self.success = True
        logger.debug("downloaded %s successfully", self.ds_time)

    def _add_files(self):
        ds_hr_str = self.ds_time.strftime("%H")
        pressure_groups = (("", Dataset.pressures_pgrb2f),
                           ("b", Dataset.pressures_pgrb2bf))

        for axis_hour in Dataset.axes.hour:
            for pressure_flag, expect_pr in pressure_groups:
                fn = self.filename_pattern.format(ds_hour=ds_hr_str,
                                                  pressure_flag=pressure_flag,
                                                  axis_hour=axis_hour)
                qi = self._queue_item_type(axis_hour, 0, fn, expect_pr, 0)
                self._files.put(qi)
                self.files_count += 1

        logger.info("Need to download %s files", self.files_count)

    def _run_workers(self, addresses, total_timeout_secs):
        logger.debug("Spawning %s workers", len(addresses) * 2)

        # don't ask _join_all to raise the first exception it catches
        # if we're already raising something in the except block
        raising = False

        try:
            for worker_id, address in enumerate(addresses * 2):
                w = DownloadWorker(self, worker_id, address)
                w.start()
                w.link()
                self._greenlets.add(w)

            # worker unhandled exceptions are raised in this greenlet
            # via link(). They can appear in completed.wait and
            # greenlets.kill(block=True) only (the only times that this
            # greenlet will yield)
            self.completed.wait(timeout=total_timeout_secs)

        except:
            # includes LinkedCompleted - a worker should not exit cleanly
            # until we .kill them below
            logger.debug("_run_workers catch %s (will reraise)",
                         sys.exc_info()[1])
            raising = True
            raise

        finally:
            # don't leak workers.
            self._join_all(raise_exception=(not raising))

    def _join_all(self, raise_exception=False):
        # we need the loop to run to completion and so have it catch and
        # hold or discard exceptions for later.
        # track the first exception caught and re-raise that
        exc_info = None

        while len(self._greenlets):
            try:
                self._greenlets.kill(block=True)
            except greenlet.LinkedCompleted:
                # now that we've killed workers, these are expected.
                # ignore.
                pass
            except greenlet.LinkedFailed as e:
                if exc_info is None and raise_exception:
                    logger.debug("_join_all catch %s "
                                 "(will reraise)", e)
                    exc_info = sys.exc_info()
                else:
                    logger.debug("_join_all discarding %s "
                                 "(already have exc)", e)

        if exc_info is not None:
            try:
                reraise(exc_info[1], None, exc_info[2])
            finally:
                # avoid circular reference
                del exc_info

    def _file_complete(self):
        self.files_complete += 1
        self.have_first_file = True

        if self.files_complete == self.files_count:
            self.completed.set()

        logger.info("progress %s/%s %s%%",
                    self.files_complete, self.files_count,
                    self.files_complete / self.files_count * 100)

    def close(self, move_files=None):
        if move_files is None:
            move_files = self.success

        if self._dataset is not None or self._gribmirror is not None or \
                self._tmp_directory is not None:
            if move_files:
                logger.info("moving downloaded files")
            else:
                logger.info("deleting failed download files")

        if self._dataset is not None:
            self._dataset.close()
            self._dataset = None
            if move_files:
                self._move_file()
            else:
                self._delete_file()

        if self._gribmirror is not None:
            self._gribmirror.close()
            self._gribmirror = None
            if move_files:
                self._move_file(Dataset.SUFFIX_GRIBMIRROR)
            else:
                self._delete_file(Dataset.SUFFIX_GRIBMIRROR)

        if self._tmp_directory is not None:
            self._remove_download_directory()
            self._tmp_directory = None

    def __del__(self):
        self.close()

    def _remove_download_directory(self):
        l = os.listdir(self._tmp_directory)
        if l:
            logger.warning("cleaning %s unknown file%s in temporary directory",
                           len(l), '' if len(l) == 1 else 's')

        logger.debug("removing temporary directory")
        shutil.rmtree(self._tmp_directory)

    def _move_file(self, suffix=''):
        fn1 = Dataset.filename(self.ds_time,
                               directory=self._tmp_directory,
                               suffix=suffix)
        fn2 = Dataset.filename(self.ds_time,
                               directory=self.directory,
                               suffix=suffix)
        logger.debug("renaming %s to %s", fn1, fn2)
        os.rename(fn1, fn2)

    def _delete_file(self, suffix=''):
        fn = Dataset.filename(self.ds_time,
                              directory=self._tmp_directory,
                              suffix=suffix)
        logger.warning("deleting %s", fn)
        os.unlink(fn)

class DownloadWorker(gevent.Greenlet):
    def __init__(self, downloader, worker_id, connect_host):
        gevent.Greenlet.__init__(self)

        self.downloader = downloader
        self.worker_id = worker_id
        self.connect_host = connect_host

        self._connection = None
        self._server_sleep_backoff = 0
        self._server_sleep_time = 0
        self._files = downloader._files

        logger_path = logger.name + ".worker.{0}".format(worker_id)
        self._logger = logging.getLogger(logger_path)

    def _run(self):
        while True:
            # block, with no timeout. If the queue is empty, another
            # worker might put a file back in (after failure)
            queue_item = self._files.get(block=True)

            self._logger.debug("downloading %s", queue_item.filename)

            sleep_for = queue_item.sleep_until - time()
            if sleep_for > 0:
                self._logger.debug("sleeping for %s", sleep_for)
                self._connection_close() # don't hold connections open
                sleep(sleep_for)

            # by default, sleep zero seconds at the end to yield:
            # if we not-found, ideally we want another server to try
            self._server_sleep_time = 0

            self._run_queue_item(queue_item)

            if self._server_sleep_time > 0:
                self._connection_close()

            sleep(self._server_sleep_time)

    def _run_queue_item(self, queue_item):
        temp_file = os.path.join(self.downloader._tmp_directory,
                                 queue_item.filename)

        try:
            self._logger.debug("begin download")

            timeout = Timeout(self.downloader.timeout)
            timeout.start()
            try:
                self._download_file(temp_file, queue_item)
            finally:
                timeout.cancel()

            self._unpack_file(temp_file, queue_item)

        except NotFound:
            self._handle_notfound(queue_item)

        except Timeout:
            self._handle_timeout(queue_item)

        except BadFile as e:
            abort = self._handle_badfile(queue_item)
            if abort:
                raise # thereby killing the whole download

        except (gevent.socket.error, ftplib.Error):
            self._handle_ioerror(queue_item)

        except (greenlet.GreenletExit, KeyboardInterrupt, SystemExit):
            raise

        else:
            self._server_sleep_backoff = 0
            # unfortunately gevent doesn't have JoinablePriorityQueues
            self.downloader._file_complete()

        finally:
            try:
                os.unlink(temp_file)
            except OSError as e:
                if e.errno != errno.ENOENT:
                    raise

    def _download_file(self, temp_file, queue_item):
        if self._connection is None:
            self._logger.debug("connecting to %s", self.connect_host)
            self._connection = FTP(self.connect_host, user='anonymous')

        remote_file = os.path.join(self.downloader.remote_directory,
                                   queue_item.filename)

        with open(temp_file, "w") as f:
            start = time()
            length = 0

            try:
                self._connection.retrbinary('RETR ' + remote_file, f.write)
            except ftplib.Error as e:
                if e[0].startswith("550"):
                    raise NotFound
                else:
                    raise

            length = f.tell()
            end = time()

            duration = end - start
            speed = length / (duration * 1024 * 1024)
            self._logger.debug("download complete, speed %sMB/s", speed)

    def _handle_notfound(self, queue_item):
        if self.downloader.have_first_file:
            sleep_time = self.downloader.timeout
        else:
            sleep_time = self.downloader.first_file_timeout
        self._logger.info("not found: %s; file sleep %s",
                          queue_item.filename, sleep_time)
        sleep_until = time() + sleep_time
        self._files.put(queue_item._replace(sleep_until=sleep_until))

    def _handle_timeout(self, queue_item):
        # skip the small server sleeps (less than the timeout that just
        # failed); also ensures other workers get a go at this file
        backoff_min = int(math.ceil(math.log(self.downloader.timeout, 2)))
        if self._server_sleep_backoff < backoff_min + 1:
            self._server_sleep_backoff = backoff_min + 1

        self._server_sleep_time = 2 ** self._server_sleep_backoff
        self._logger.warning("timeout while downloading %s; server sleep %s",
                             queue_item.filename, self._server_sleep_time)
        self._files.put(queue_item)

    def _handle_badfile(self, queue_item):
        retry_limit = self.downloader.bad_download_retry_limit
        if queue_item.bad_downloads == retry_limit:
            self._logger.exception("retry limit reached")
            return True # abort download
        else:
            n = queue_item.bad_downloads + 1
            su = time() + self.downloader.timeout
            i = queue_item._replace(bad_downloads=n, sleep_until=su)
            self._logger.warning("bad file (%s, attempt %s), file sleep %s",
                                 queue_item.filename, n,
                                 self.downloader.timeout, exc_info=1)
            self._files.put(i)

    def _handle_ioerror(self, queue_item):
        if self._server_sleep_backoff < 10:
            self._server_sleep_backoff += 1
        self._server_sleep_time = 2 ** self._server_sleep_backoff

        # don't print a stack trace until it's more
        if self._server_sleep_backoff >= 5:
            lf = lambda a, b: self._logger.warning(a, b, exc_info=1)
        else:
            lf = self._logger.info
        lf("exception; server sleep %s", self._server_sleep_time)

        self._files.put(queue_item)

    def _connection_close(self):
        try:
            self._connection.close()
        except (greenlet.GreenletExit, KeyboardInterrupt, SystemExit):
            raise
        except:
            pass
        self._connection = None

    def _unpack_file(self, temp_file, queue_item):
        # callback: yields to other greenlets for IO _only_
        # the timeout must be cancelled - we do not want to be interrupted,
        # it could leave downloader._dataset/_checklist in an inconsistent
        # state

        with self.downloader.unpack_lock:
            axes = ([queue_item.hour], queue_item.expect_pressures,
                    Dataset.axes.variable)
            file_checklist = set(itertools.product(*axes))

            try:
                unpack_grib(temp_file,
                            self.downloader._dataset,
                            self.downloader._checklist,
                            self.downloader._gribmirror,
                            file_checklist=file_checklist,
                            assert_hour=queue_item.hour,
                            callback=lambda a, b, c: sleep(0))
            except (greenlet.GreenletExit, KeyboardInterrupt, SystemExit):
                raise
            except:
                try:
                    type, value, traceback = sys.exc_info()
                    value = str(value)
                    reraise(BadFile(value), None, traceback)
                finally:
                    # avoid circular reference
                    del traceback

class DownloadDaemon(object):
    def __init__(self, directory, num_datasets=1):
        # TODO - accept the options that DatasetDownloader does
        self.directory = directory
        self.num_datasets = num_datasets

    def clean_directory(self):
        # also returns the latest dataset we have

        # XXX: this won't clean up gribmirror files that don't have their
        # corresponding dataset.
        datasets = Dataset.listdir(self.directory, only_suffices=('', ))
        keep_rows = sorted(datasets, reverse=True)[:self.num_datasets]
        keep_ds_times = [r.ds_time for r in keep_rows]

        kept = []
        removed = []

        for row in Dataset.listdir(self.directory):
            if row.ds_time not in keep_ds_times:
                removed.append(row.filename)
                os.unlink(row.path)
            else:
                kept.append(row.filename)

        logger.info("cleaning: kept %s, removed %s", kept, removed)

        for filename in os.listdir(self.directory):
            if filename.startswith("download."):
                logging.warning("removing old temporary directory %s", filename)
                shutil.rmtree(os.path.join(self.directory, filename))

        if len(keep_ds_times):
            logger.debug("latest downloaded dataset is: %s", keep_ds_times[0])
            return keep_ds_times[0]
        else:
            return None

    def run(self):
        last_downloaded_dataset = self.clean_directory()
        latest_dataset = self._latest_dataset()

        if last_downloaded_dataset is None or \
                last_downloaded_dataset < latest_dataset:
            next_dataset = latest_dataset
        else:
            next_dataset = last_downloaded_dataset + timedelta(hours=6)

        while True:
            # datasets typically start hitting the mirror 3.5 hours after
            # their named time
            expect = next_dataset + timedelta(hours=3, minutes=30)
            wait_for = (expect - datetime.now()).total_seconds()
            if wait_for > 0:
                logger.info("waiting until %s (%s) for dataset %s",
                            expect, wait_for, next_dataset)
                sleep(wait_for)

            logger.info("downloading dataset %s", next_dataset)
            self._download(next_dataset)
            self.clean_directory()

            next_dataset += timedelta(hours=6)

    def _latest_dataset(self):
        latest_dataset = (datetime.now() - timedelta(hours=3, minutes=30)) \
                         .replace(minute=0, second=0, microsecond=0)
        hour = latest_dataset.hour - (latest_dataset.hour % 6)
        latest_dataset = latest_dataset.replace(hour=hour)
        logger.info("latest dataset is %s", latest_dataset)
        return latest_dataset

    def _download(self, ds_time):
        try:
            d = DatasetDownloader(self.directory, ds_time)
            d.open()
            d.download()
        except (greenlet.GreenletExit, KeyboardInterrupt, SystemExit):
            raise
        except:
            logger.exception("Failed to download %s", ds_time)
        else:
            logger.info("Download complete %s", ds_time)
        finally:
            d.close()

def _parse_ds_str(ds_time_str):
    try:
        if len(ds_time_str) != 10:
            raise ValueError
        ds_time = datetime.strptime(ds_time_str, "%Y%m%d%H")
    except ValueError:
        raise argparse.ArgumentTypeError("invalid dataset string")

    if ds_time.hour % 6 != 0:
        raise argparse.ArgumentTypeError("dataset hour must be a multiple of 6")

    return ds_time


_format_email = \
"""%(levelname)s from logger %(name)s (thread %(threadName)s)

Time:       %(asctime)s
Location:   %(pathname)s:%(lineno)d
Module:     %(module)s
Function:   %(funcName)s

%(message)s"""

_format_string = \
"[%(asctime)s] %(levelname)s %(name)s %(threadName)s: %(message)s"


def main():
    root_logger = logging.getLogger()
    root_logger.setLevel(logging.DEBUG)

    parent = argparse.ArgumentParser(add_help=False)
    parent.add_argument('-d', '--directory', default=Dataset.DEFAULT_DIRECTORY)
    parent.add_argument('-f', '--log-file')
    parent.add_argument('-e', '--email-exceptions', metavar='USER@DOMAIN.TLD')
    parent.add_argument('-s', '--email-from', default='tawhiri@localhost')
    parent.add_argument('-c', '--email-server', default='localhost')

    group = parent.add_mutually_exclusive_group()
    group.add_argument('-w', '--log-file-verbose', action="store_true")
    group.add_argument('-r', '--log-file-quiet', action="store_true")

    group = parent.add_mutually_exclusive_group()
    group.add_argument("-v", "--verbose", action="store_true")
    group.add_argument("-q", "--quiet", action="store_true")

    parser = argparse.ArgumentParser(description='Dataset Downloader')
    subparsers = parser.add_subparsers(dest='subparser_name')

    parser_daemon = subparsers.add_parser('daemon', parents=[parent],
                                          help='downloader daemon mode')
    parser_daemon.add_argument('-n', '--num-datasets', type=int, default=1)

    parser_download = subparsers.add_parser('download', parents=[parent],
                                            help='download a single dataset')
    parser_download.add_argument('dataset', type=_parse_ds_str)

    # TODO - more options (other options of relevant initialisers)

    args = parser.parse_args()

    fmtr = logging.Formatter(_format_string)

    handler = logging.StreamHandler() # stderr
    handler.setFormatter(fmtr)
    if args.verbose:
        handler.setLevel(logging.DEBUG)
    elif not args.quiet:
        handler.setLevel(logging.INFO)
    else:
        handler.setLevel(logging.WARNING)
    root_logger.addHandler(handler)

    if args.log_file:
        handler = logging.handlers.WatchedFileHandler(args.log_file)
        handler.setFormatter(fmtr)
        if args.log_file_verbose:
            handler.setLevel(logging.DEBUG)
        elif not args.log_file_quiet:
            handler.setLevel(logging.INFO)
        else:
            handler.setLevel(logging.WARNING)
        root_logger.addHandler(handler)
        logger.info("Opening log file %s", args.log_file)

    if args.email_exceptions:
        emails_to = [args.email_exceptions]
        emails_from = args.email_from
        email_server = args.email_server

        handler = logging.handlers.SMTPHandler(
                email_server, emails_from, emails_to,
                "tawhiri wind downloader")
        handler.setLevel(logging.ERROR)
        handler.setFormatter(logging.Formatter(_format_email))
        root_logger.addHandler(handler)

    try:
        if args.subparser_name == 'download':
            d = DatasetDownloader(args.directory, args.dataset)
            try:
                d.open()
                d.download()
            finally:
                d.close()
        else:
            d = DownloadDaemon(args.directory, args.num_datasets)
            d.run()
    except (greenlet.GreenletExit, KeyboardInterrupt, SystemExit):
        logger.warning("exit via %s", sys.exc_info()[0].__name__)
        raise
    except:
        logger.exception("unhandled exception")
        raise

if __name__ == "__main__":
    main()
