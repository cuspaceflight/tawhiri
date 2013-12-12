# Copyright (C) 2013 Daniel Richman
#
# This file is part of tawhiri.
#
# tawhiri is free software: you can redistribute it and/or modify
# it under the terms of the GNU General Public License as published by
# the Free Software Foundation, either version 3 of the License, or
# (at your option) any later version.
#
# tawhiri is distributed in the hope that it will be useful,
# but WITHOUT ANY WARRANTY; without even the implied warranty of
# MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
# GNU General Public License for more details.
#
# You should have received a copy of the GNU General Public License
# along with tawhiri.  If not, see <http://www.gnu.org/licenses/>.

from __future__ import unicode_literals, print_function, division

import logging
from collections import namedtuple
import os
import os.path
from datetime import datetime
import numpy as np
import pygrib

logger = logging.getLogger("tawhiri.wind")


class Dataset(object):
    shape = (65, 47, 3, 361, 720)

    # TODO: use the other levels too?
    # {10, 80, 100}m heightAboveGround (u, v)
    #       -- note ground, not mean sea level - would need elevation
    # 0 unknown "planetary boundry layer" (u, v) (first two records)
    # 0 surface "Planetary boundary layer height"
    # {1829, 2743, 3658} heightAboveSea (u, v)
    pressures_pgrb2f = [10, 20, 30, 50, 70, 100, 150, 200, 250, 300, 350, 400,
                        450, 500, 550, 600, 650, 700, 750, 800, 850, 900, 925,
                        950, 975, 1000]
    pressures_pgrb2bf = [1, 2, 3, 5, 7, 125, 175, 225, 275, 325, 375, 425,
                         475, 525, 575, 625, 675, 725, 775, 825, 875]

    _axes_type = namedtuple("axes",
                ("hour", "pressure", "variable", "latitude", "longitude"))

    axes = _axes_type(
        range(0, 192 + 3, 3),
        sorted(pressures_pgrb2f + pressures_pgrb2bf, reverse=True),
        ["height", "wind_u", "wind_v"],
        np.arange(-90, 90 + 0.5, 0.5),
        np.arange(0, 360, 0.5)
    )

    _listdir_type = namedtuple("dataset_in_row",
                ("ds_time", "suffix", "filename", "path"))

    assert shape == tuple(len(x) for x in axes)

    SUFFIX_GRIBMIRROR = '.gribmirror'

    @classmethod
    def filename(cls, directory, ds_time, suffix=''):
        ds_time_str = ds_time.strftime("%Y%m%d%H")
        return os.path.join(directory, ds_time_str + suffix)

    @classmethod
    def listdir(cls, directory, only_suffices=None):
        for filename in os.listdir(directory):
            if len(filename) < 10:
                continue

            ds_time_str = filename[:10]
            try:
                ds_time = datetime.strptime(ds_time_str, "%Y%m%d%H")
            except ValueError:
                pass
            else:
                suffix = filename[10:]
                if only_suffices and suffix not in only_suffices:
                    continue

                yield cls._listdir_type(ds_time, suffix, filename,
                                        os.path.join(directory, filename))

    @classmethod
    def checklist(cls):
        return np.zeros(cls.shape[0:3], dtype=np.bool_)

    def __init__(self, directory, ds_time, suffix='', new=False):
        self.directory = directory
        self.ds_time = ds_time
        self.new = new

        self.fn = self.filename(self.directory, self.ds_time, suffix)

        logger.info("Opening dataset %s %s %s", self.ds_time, self.fn,
                        '(truncate and write)' if new else '(read)')

        self.array = np.memmap(self.fn, mode=('w+' if self.new else 'r'),
                               dtype=np.float64, shape=self.shape, order='C')

    def __del__(self):
        self.close()

    def close(self):
        if hasattr(self, 'array'):
            logger.info("Closing dataset %s %s", self.ds_time, self.fn)
            del self.array


_grib_name_to_variable = {"Geopotential Height": "height",
                          "U component of wind": "wind_u",
                          "V component of wind": "wind_v"}

def unpack_grib(filename, dataset=None, checklist=None, gribmirror=None,
                assert_hour=None, file_checklist=None, callback=None):
    # callback must _not_ edit dataset/checklist/gribmirror
    # or yield to a greenlet that will (see DownloadDaemon.unpack_lock)

    assert Dataset.axes._fields[0:3] == ("hour", "pressure", "variable")
    if dataset is not None:
        assert dataset.axes == Dataset.axes
        assert dataset.shape == Dataset.shape

    if file_checklist is not None:
        file_checklist = file_checklist.copy()


    grib = pygrib.open(filename)
    try:
        # pass one: check the contents of the file
        _check_grib_file(grib, filename, dataset, checklist,
                         assert_hour, file_checklist, callback)

        # pass two: unpack
        for record, location, location_name in _grib_records(grib):
            if dataset is not None:
                dataset.array[location] = record.values
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

def _check_grib_file(grib, filename, dataset, checklist,
                     assert_hour, file_checklist, callback):
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

        if dataset is not None and \
                dataset.array[location].shape != record.values.shape:
            raise ValueError("record values had incorrect shape")

        logger.debug("checked %s %s %s", filename, location_name, location)

        if callback is not None:
            callback(False, location, location_name)

    if file_checklist != set():
        raise ValueError("records missing from file")

def _grib_records(grib):
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
    if checklist is not None and checklist[location]:
        raise ValueError("record already unpacked (from other file): {0}"
                            .format(location_name))
    if assert_hour is not None and record.forecastTime != assert_hour:
        raise ValueError("Incorrect forecastTime (assert_hour)")
    if file_checklist is not None and location_name not in file_checklist:
        raise ValueError("unexpected record: {0}".format(location_name))

def _check_axes(record):
    # I'm unsure whether this is the correct thing to do.
    # Some GRIB functions (.latitudes, .latLonValues) have the
    # latitudes scanning negatively (90 to -90); but .values and
    # .distinctLatitudes seem to return a grid scanning positively
    # If it works...
    if not np.array_equal(record.distinctLatitudes,
                          Dataset.axes.latitude):
        raise ValueError("unexpected axes on record (latitudes)")
    if not np.array_equal(record.distinctLongitudes,
                          Dataset.axes.longitude):
        raise ValueError("unexpected axes on record (longitudes)")
