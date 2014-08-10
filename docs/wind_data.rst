Wind Data
=========

Forecasts are published (for free!) by the `NOAA <http://www.noaa.gov>`_, in the form of several hundred `GRIB <http://en.wikipedia.org/wiki/GRIB>`_ files.

The axes of the dataset are time, pressure level, variable, latitude and longitude. That is, the “vertical” axis is not altitude; there is a forecast for various variables at certain fixed air pressure levels.
The variables we are interested in are “wind u”, “wind v” and “altitude”; the first two being the speed in meters of the wind due east and north respectively.

We store wind datasets as a large array of floats (32bit). This amounts to a 9GB file on disk, which is memory mapped into the predictor and downloader processes as needed. The operating system manages caching, which means that data for popular areas can be loaded very quickly, even after a cold start of the predictor process itself.

:mod:`tawhiri.download` is responsible for acquiring the wind dataset. It downloads all the relevant GRIB files (~6GB), decompresses them, and stores the wind data in a new file on disk.

:mod:`tawhiri.interpolate`, given a dataset, estimates “wind u” and “wind v” at some time, latitude, longitude and altitude, by searching for two pressure levels between which the altiutde is contained, and interpolating along the 4 axes. More details on the implementation of this are available `here <implementation>`_
