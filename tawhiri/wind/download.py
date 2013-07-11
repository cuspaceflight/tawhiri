from __future__ import division

import numpy as np
import logging
import sys
import os
import os.path
import errno
import shutil
import math
import tempfile
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
import gevent.socket
import httplib
import itertools
import pygrib

from . import Dataset, unpack_grib


logger = logging.getLogger("tawhiri.wind.download")
assert Dataset.axes._fields[0:3] == ("hour", "pressure", "variable")


class HTTPConnection(httplib.HTTPConnection):
    # gevent.httplib is bad:
    # in ubuntu 12.04 breaks on all ipv6; fixed upstream Jan 2012.
    # .read() seems to wait for the entire request.
    #
    # Let's subclass httplib rather than using monkey patching.

    def connect(self):
        self.sock = gevent.socket.create_connection(
                (self.host,self.port), self.timeout, self.source_address)

        if self._tunnel_host:
            self._tunnel()

class NotFound(Exception):
    pass

class DatasetDownloader(object):
    def __init__(self, directory, ds_time, timeout=120,
                 first_file_timeout=600,
                 write_dataset=True, write_gribmirror=True,
                 deadline=None,
                 dataset_host="www.ftp.ncep.noaa.gov",
                 dataset_path="/data/nccf/com/gfs/prod/gfs.{0}/"):

        assert ds_time.hour in (0, 6, 12, 18)
        assert ds_time.minute == ds_time.second == ds_time.microsecond == 0

        if not (write_dataset or write_gribmirror):
            raise ValueError("Choose write_datset or write_gribmirror "
                                "(or both)")

        if deadline is None:
            deadline = max(datetime.now() + timedelta(hours=2),
                           ds_time + timedelta(hours=6))

        self.directory = directory
        self.ds_time = ds_time

        self.timeout = timeout
        self.first_file_timeout = first_file_timeout
        self.write_dataset = write_dataset
        self.write_gribmirror = write_gribmirror

        self.deadline = deadline
        self.dataset_host = dataset_host
        self.dataset_path = dataset_path

        self.have_first_file = False

        self.files_complete = 0
        self.files_count = 0
        self.completed = Event()
        self.success = False

        ds_time_str = self.ds_time.strftime("%Y%m%d%H")
        self.remote_directory = dataset_path.format(ds_time_str)

        self._dataset = None
        self._gribmirror = None
        self._tmp_directory = None

        # Items in the queue are (hour, sleep_until, filename)
        # so they sort by hour, and then if a 404 adds a delay to
        # a specific file, files from that hour without the delay
        # are tried first
        self._files = PriorityQueue()
        self._greenlets = Group()
        self._checklist = Dataset.checklist()

    def open(self):
        self._tmp_directory = \
                tempfile.mkdtemp(dir=self.directory, prefix="download.")
        os.chmod(self._tmp_directory, 0775)
        logger.info("Temporary directory is %s", self._tmp_directory)

        if self.write_dataset:
            self._dataset = \
                    Dataset(self._tmp_directory, self.ds_time, new=True)

        if self.write_gribmirror:
            fn = Dataset.filename(self._tmp_directory, self.ds_time,
                                  Dataset.SUFFIX_GRIBMIRROR)
            logger.info("Opening gribmirror (truncate and write) %s %s",
                                self.ds_time, fn)
            self._gribmirror = open(fn, "w+")

    def download(self):
        ttl, addresses = resolve_ipv4(self.dataset_host)
        logger.info("Resolved to %s IPs", len(addresses))

        addresses = [inet_ntoa(x) for x in addresses]

        total_timeout = self.deadline - datetime.now()
        total_timeout_secs = total_timeout.total_seconds()
        if total_timeout_secs < 0:
            raise ValueError("Deadline already passed")
        else:
            logger.info("Deadline in %s", total_timeout)

        self._add_files()
        self._run_workers(addresses, total_timeout_secs)

        if not self.completed.is_set():
            raise ValueError("timed out")

        if not self._checklist.all():
            raise ValueError("incomplete: records missing")

        self.success = True

    def _add_files(self):
        filename_prefix = self.ds_time.strftime("gfs.t%Hz.pgrb2")

        for hour in Dataset.axes.hour:
            hour_str = "{0:02}".format(hour)
            files = tuple(filename_prefix + x + hour_str for x in ["f", "bf"])
            for filename in files:
                self.files_count += 1
                self._files.put((hour, 0, filename))

    def _run_workers(self, addresses, total_timeout_secs):
        logger.info("Spawning %s workers", len(addresses))

        # don't ask _join_all to raise the first exception it catches
        # if we're already raising something in the except block
        raising = False

        try:
            for worker_id, address in enumerate(addresses):
                w = DownloadWorker(self, worker_id, address)
                w.start()
                w.link()
                self._greenlets.add(w)

            # worker unhandled exceptions are raised in this greenlet
            # via link(). They can appwaear in completed.wait and
            # greenlets.kill(block=True) only (only times this greenlet
            # will yield
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
                raise exc_info[1], None, exc_info[2]
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
        dir = self._tmp_directory
        l = os.listdir(dir)

        if l:
            logger.info("cleaning %s unknown file%s in temporary directory",
                        len(l), '' if len(l) == 1 else 's')
            for filename in l:
                os.unlink(os.path.join(dir, filename))

        logger.info("removing temporary directory")
        os.rmdir(dir)

    def _move_file(self, suffix=''):
        fn1 = Dataset.filename(self._tmp_directory, self.ds_time, suffix)
        fn2 = Dataset.filename(self.directory, self.ds_time, suffix)
        logger.info("renaming %s to %s", fn1, fn2)
        os.rename(fn1, fn2)

    def _delete_file(self, suffix=''):
        fn = Dataset.filename(self._tmp_directory, self.ds_time, suffix)
        logger.info("deleting %s", fn)
        os.unlink(fn)

class DownloadWorker(gevent.Greenlet):
    def __init__(self, downloader, worker_id, connect_host):
        gevent.Greenlet.__init__(self)

        self.downloader = downloader
        self.worker_id = worker_id
        self.connect_host = connect_host

        self._connection = None
        self._files = downloader._files

        logger_path = logger.name + ".worker.{0}".format(worker_id)
        self._logger = logging.getLogger(logger_path)

    def _run(self):
        server_sleep_backoff = 0

        while True:
            # block, with no timeout. If the queue is empty, another
            # worker might put a file back in (after failure)
            hour, sleep_until, filename = self._files.get(block=True)

            self._logger.info("downloading %s", filename)

            sleep_for = sleep_until - time()
            if sleep_for > 0:
                self._logger.info("sleeping for %s", sleep_for)
                self._connection_close() # don't hold connections open
                sleep(sleep_for)

            # sleep zero seconds at the end to yield:
            # if we 404, ideally we want another server to try
            server_sleep_time = 0

            try:
                self._logger.info("begin download")

                timeout = Timeout(self.downloader.timeout)
                timeout.start()
                try:
                    self._download_file(hour, filename)
                finally:
                    timeout.cancel()

            except NotFound as e:
                if self.downloader.have_first_file:
                    sleep_time = self.downloader.timeout
                else:
                    sleep_time = self.downloader.first_file_timeout
                self._logger.info("404, file sleep %s", sleep_time)
                self._files.put((hour, time() + sleep_time, filename))

            except Timeout:
                # skip the small server sleeps (less than the timeout that just
                # failed); also ensures other workers get a go at this file
                server_sleep_backoff = \
                        max(server_sleep_backoff,
                            int(math.log(self.downloader.timeout, 2) + 1))

                log_to = int(math.ceil(math.log(self.downloader.timeout, 2)))
                if server_sleep_backoff < log_to + 1:
                    server_sleep_backoff = log_to + 1
                server_sleep_time = 2 ** server_sleep_backoff

                self._logger.info("timeout, server sleep %s",
                                    server_sleep_time)
                self._files.put((hour, 0, filename))

            except (greenlet.GreenletExit, KeyboardInterrupt, SystemExit):
                raise

            except:
                if server_sleep_backoff < 10:
                    server_sleep_backoff += 1
                server_sleep_time = 2 ** server_sleep_backoff

                # don't print an exception until it's serious
                if server_sleep_backoff >= 5:
                    lf = self._logger.exception
                else:
                    lf = self._logger.info
                lf("exception; server sleep %s", server_sleep_time)

                self._files.put((hour, 0, filename))

            else:
                server_sleep_backoff = 0
                # unfortunately gevent doesn't have JoinablePriorityQueues
                self.downloader._file_complete()

            if server_sleep_time > 0:
                self._connection_close()

            sleep(server_sleep_time)

    def _connection_close(self):
        try:
            self._connection.close()
        except (greenlet.GreenletExit, KeyboardInterrupt, SystemExit):
            raise
        except:
            pass
        self._connection = None

    def _download_file(self, hour, filename):
        if self._connection is None:
            self._logger.info("connecting to %s", self.connect_host)
            self._connection = HTTPConnection(self.connect_host)

        remote_file = os.path.join(self.downloader.remote_directory, filename)
        temp_file = os.path.join(self.downloader._tmp_directory, filename)

        headers = {"Connection": "Keep-Alive",
                   "Host": self.downloader.dataset_host}
        self._connection.request("GET", remote_file, headers=headers)

        resp = self._connection.getresponse()

        if resp.status == 404:
            raise NotFound
        elif resp.status != 200:
            raise Exception("Status: {0}".format(resp.status))

        # if open() fails, os.unlink will raise an exception in the finally
        # block, obscuring the original exception
        opened = False

        try:
            with open(temp_file, "w") as f:
                opened = True

                start = time()
                length = 0

                while True:
                    d = resp.read(1024 * 1024)
                    if d == '':
                        break
                    f.write(d)
                    length += len(d)

                end = time()

                duration = end - start
                speed = length / (duration * 1024 * 1024)
                self._logger.info("download complete, speed %sMB/s", speed)
        except:
            raise
        else:
            unpack_grib(temp_file,
                        self.downloader._dataset,
                        self.downloader._checklist,
                        self.downloader._gribmirror,
                        assert_hour=hour)
        finally:
            # timeout only fires on blocking gevent operations so won't
            # race with catching another exception.
            # cancelling will prevent the exception even if the timer
            # is overdue
            if opened:
                os.unlink(temp_file)
