from __future__ import division

import numpy as np
import logging
import os
import os.path
import errno
import shutil
import math
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


logger = logging.getLogger("tawhiri.wind.download")


from . import Dataset, unpack_grib
axes = Dataset.axes
shape = Dataset.shape
assert axes._fields[0:3] == ("hour", "pressure", "variable")


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
    @classmethod
    def download_directory(cls, directory):
        return os.path.join(directory, "download")

    def __init__(self, directory, ds_time, timeout=120,
                 first_file_timeout=600,
                 write_dataset=True, write_gribmirror=True,
                 deadline=None,
                 dataset_host="www.ftp.ncep.noaa.gov",
                 dataset_path="/data/nccf/com/gfs/prod/gfs.{0}/"):
        assert ds_time.hour in (0, 6, 12, 18)
        assert ds_time.minute == ds_time.second == ds_time.microsecond == 0

        if deadline is None:
            deadline = max(datetime.now() + timedelta(hours=2),
                           ds_time + timedelta(hours=5))

        self.directory = directory
        self.ds_time = ds_time

        self.local_directory = self.download_directory(self.directory)
        self.timeout = timeout
        self.first_file_timeout = first_file_timeout
        self.deadline = deadline
        self.dataset_host = dataset_host
        self.dataset_path = dataset_path

        self.have_first_file = False

        if write_dataset:
            self.dataset = Dataset(self.directory, self.ds_time,
                                   Dataset.SUFFIX_DOWNLOADING, new=True)
        else:
            self.dataset = None

        if write_gribmirror:
            fn = Dataset.filename(self.directory, self.ds_time,
                      Dataset.SUFFIX_GRIBMIRROR + Dataset.SUFFIX_DOWNLOADING)
            logger.info("Opening gribmirror (truncate and write) %s %s",
                                self.ds_time, fn)
            self.gribmirror = open(fn, "w+")
        else:
            self.gribmirror = None

        if not (write_dataset or write_gribmirror):
            raise ValueError("Choose write_datset or write_gribmirror "
                                "(or both)")

        self.checklist = np.zeros(shape[0:3], dtype=np.bool_)
        self.files_complete = 0
        self.files_count = 0
        self.completed = Event()

        ds_time_str = self.ds_time.strftime("%Y%m%d%H")
        self.remote_directory = dataset_path.format(ds_time_str)

        filename_prefix = self.ds_time.strftime("gfs.t%Hz.pgrb2")

        # Items in the queue are (hour, sleep_until, filename)
        # so they sort by hour, and then if a 404 adds a delay to
        # a specific file, files from that hour without the delay
        # are tried first
        self.files = PriorityQueue()

        for hour in axes.hour:
            hour_str = "{0:02}".format(hour)
            files = tuple(filename_prefix + x + hour_str for x in ["f", "bf"])
            for filename in files:
                self.files_count += 1
                self.files.put((hour, 0, filename))

        self.greenlets = Group()

    def download(self):
        self.make_download_directory()

        ttl, addresses = resolve_ipv4(self.dataset_host)
        logger.info("Resolved to %s IPs", len(addresses))

        addresses = [inet_ntoa(x) for x in addresses]

        total_timeout = self.deadline - datetime.now()
        total_timeout_secs = total_timeout.total_seconds()
        if total_timeout_secs < 0:
            raise ValueError("Deadline already passed")

        try:
            logger.info("Spawning %s workers", len(addresses))
            for worker_id, address in enumerate(addresses):
                w = DownloadWorker(self, worker_id, address)
                w.start()
                w.link()
                self.greenlets.add(w)

            logger.info("Deadline in %s", total_timeout)
            self.completed.wait(timeout=total_timeout_secs)
        except greenlet.LinkedExited:
            # if a worker dies, abort. kill and join to get the exceptions
            pass
        finally:
            self.greenlets.kill(block=False)

        # wait for them to die, reraising any worker exceptions
        while True:
            try:
                self.greenlets.join(raise_error=True)
            except greenlet.LinkedCompleted:
                # we'll get a lot of these...
                pass
            else:
                break

        if not self.completed.is_set():
            raise ValueError("timed out")

        if not self.checklist.all():
            raise ValueError("incomplete: records missing")

    def make_download_directory(self):
        try:
            os.mkdir(self.local_directory)
        except OSError as e:
            if e.errno == errno.EEXIST:
                pass
            else:
                raise

    def clear_download_directory(self):
        dir = self.local_directory
        l = os.listdir(dir)
        logger.info("Cleaning %s (%s files)", dir, len(l))
        for filename in l:
            os.unlink(os.path.join(dir, filename))
        os.rmdir(self.local_directory)

    def file_complete(self):
        self.files_complete += 1
        self.have_first_file = True

        if self.files_complete == self.files_count:
            self.completed.set()

        logger.info("progress %s/%s %s%%",
                    self.files_complete, self.files_count,
                    self.files_complete / self.files_count * 100)

    def move_final(self, suffix=''):
        fn1 = Dataset.filename(self.directory, self.ds_time,
                               suffix + Dataset.SUFFIX_DOWNLOADING)
        fn2 = Dataset.filename(self.directory, self.ds_time, suffix)
        logger.info("renaming %s to %s", fn1, fn2)
        os.rename(fn1, fn2)

    def close(self, move_files=True):
        self.clear_download_directory()
        if self.dataset is not None:
            self.dataset.close()
            if move_files:
                self.move_final()
        if self.gribmirror is not None:
            self.gribmirror.close()
            if move_files:
                self.move_final(Dataset.SUFFIX_GRIBMIRROR)

class DownloadWorker(gevent.Greenlet):
    def __init__(self, downloader, worker_id, connect_host):
        gevent.Greenlet.__init__(self)

        self.downloader = downloader
        self.worker_id = worker_id
        self.connect_host = connect_host
        self.connection = None

        self.files = downloader.files

        logger_path = logger.name + ".worker.{0}".format(worker_id)
        self.logger = logging.getLogger(logger_path)

    def _run(self):
        server_sleep_backoff = 0

        while True:
            # block, with no timeout. If the queue is empty, another
            # worker might put a file back in (after failure)
            hour, sleep_until, filename = self.files.get(block=True)

            self.logger.info("downloading %s", filename)

            sleep_for = sleep_until - time()
            if sleep_for > 0:
                self.logger.info("sleeping for %s", sleep_for)
                self.connection_close() # don't hold connections open
                sleep(sleep_for)

            # sleep zero seconds at the end to yield:
            # if we 404, ideally we want another server to try
            server_sleep_time = 0

            try:
                self.logger.info("begin download")

                timeout = Timeout(self.downloader.timeout)
                timeout.start()
                try:
                    self.download_file(hour, filename)
                finally:
                    timeout.cancel()
            except NotFound as e:
                if self.downloader.have_first_file:
                    sleep_time = self.downloader.timeout
                else:
                    sleep_time = self.downloader.first_file_timeout
                self.logger.info("404, file sleep %s", sleep_time)
                self.files.put((hour, time() + sleep_time, filename))

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

                self.logger.info("timeout, server sleep %s", server_sleep_time)
                self.files.put((hour, 0, filename))

            except (greenlet.GreenletExit, KeyboardInterrupt, SystemExit):
                raise

            except:
                if server_sleep_backoff < 10:
                    server_sleep_backoff += 1
                server_sleep_time = 2 ** server_sleep_backoff

                self.logger.exception("exception; server sleep %s",
                                        server_sleep_time)
                self.files.put((hour, 0, filename))

            else:
                server_sleep_backoff = 0
                # unfortunately gevent doesn't have JoinablePriorityQueues
                self.downloader.file_complete()

            if server_sleep_time > 0:
                self.connection_close()

            sleep(server_sleep_time)

    def connection_close(self):
        try:
            self.connection.close()
        except (greenlet.GreenletExit, KeyboardInterrupt, SystemExit):
            raise
        except:
            pass
        self.connection = None

    def download_file(self, hour, filename):
        if self.connection is None:
            self.logger.info("connecting to %s", self.connect_host)
            self.connection = HTTPConnection(self.connect_host)

        remote_file = os.path.join(self.downloader.remote_directory, filename)
        temp_file = os.path.join(self.downloader.local_directory, filename)

        headers = {"Connection": "Keep-Alive",
                   "Host": self.downloader.dataset_host}
        self.connection.request("GET", remote_file, headers=headers)

        resp = self.connection.getresponse()

        if resp.status == 404:
            raise NotFound
        elif resp.status != 200:
            raise Exception("Status: {0}".format(resp.status))

        try:
            with open(temp_file, "w") as f:
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
                self.logger.info("download complete, speed %sMB/s", speed)
        except:
            raise
        else:
            unpack_grib(temp_file,
                        self.downloader.dataset,
                        self.downloader.checklist,
                        self.downloader.gribmirror,
                        assert_hour=hour)
        finally:
            # timeout only fires on blocking gevent operations so won't
            # race with catching another exception.
            # cancelling will prevent the exception even if the timer
            # is overdue
            os.unlink(temp_file)
