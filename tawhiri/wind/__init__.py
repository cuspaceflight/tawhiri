import logging
from collections import namedtuple
import os.path
import numpy as np
import pygrib

logger = logging.getLogger("tawhiri.wind")


class Dataset(object):
    shape = (65, 47, 3, 361, 720)

    # TODO: use the other levels too?
    _pressures_pgrb2f = [10, 20, 30, 50, 70, 100, 150, 200, 250, 300, 350, 400,
                         450, 500, 550, 600, 650, 700, 750, 800, 850, 900, 925,
                         950, 975, 1000]
    _pressures_pgrb2bf = [1, 2, 3, 5, 7, 125, 175, 225, 275, 325, 375, 425,
                          475, 525, 575, 625, 675, 725, 775, 825, 875]

    _axes_type = namedtuple("axes",
              ("hour", "pressure", "variable", "latitude", "longitude"))

    axes = _axes_type(
        range(0, 192 + 3, 3),
        sorted(_pressures_pgrb2f + _pressures_pgrb2bf),
        ["height", "wind_u", "wind_v"],
        np.arange(-90, 90 + 0.5, 0.5),
        np.arange(0, 360, 0.5)
    )

    assert shape == tuple(len(x) for x in axes)

    SUFFIX_GRIBMIRROR = '.gribmirror'
    SUFFIX_DOWNLOADING = '.downloading'

    @classmethod
    def filename(cls, directory, ds_time, suffix=''):
        ds_time_str = ds_time.strftime("%Y%m%d%H")
        return os.path.join(directory, ds_time_str + suffix)

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
                assert_hour=None):
    if dataset is None and checklist is None and gribmirror is None:
        raise ValueError("supply at least one of dataset, checklist and "
                                "gribmirror")

    assert Dataset.axes._fields[0:3] == ("hour", "pressure", "variable")
    if dataset is not None:
        assert dataset.axes == Dataset.axes
        assert dataset.shape == Dataset.shape

    grib = pygrib.open(filename)
    checked_axes = False

    for record in grib:
        if record.typeOfLevel != "isobaricInhPa":
            continue
        if record.name not in _grib_name_to_variable:
            continue

        if assert_hour is not None and record.forecastTime != assert_hour:
            raise ValueError("Incorrect forecastTime (assert_hour)")

        location_name = (record.forecastTime, record.level,
                         _grib_name_to_variable[record.name])

        location = tuple(Dataset.axes[i].index(n)
                         for i, n in enumerate(location_name))

        if checklist is not None:
            if checklist[location]:
                raise ValueError("repeated: {0}".format(location_name))
            checklist[location] = True

        # Checking axes (for some reason) is really slow, so do it once as
        # a small sanity check, and hope that if it's OK for one record,
        # the file is good.
        if not checked_axes:
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
            checked_axes = True

        if dataset is not None:
            dataset.array[location] = record.values
        if gribmirror is not None:
            gribmirror.write(record.tostring())

        logger.debug("unpacked %s %s %s", filename, location_name, location)

    logger.info("unpacked %s", filename)
    grib.close()
