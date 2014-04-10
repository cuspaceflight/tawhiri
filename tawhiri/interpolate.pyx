# Copyright 2014 (C) Adam Greig, Daniel Richman
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

# Cython compiler directives:
#
# pick(...) is careful in what it returns:
# cython: boundscheck=False
# cython: wraparound=False
#
# We check for division by zero, and don't divide by negative values
# (unless the dataset is really dodgy!):
# cython: cdivision=True

"""
Interpolation to determine wind velocity at any given time,
latitude, longitude and altitude.

Note that this module is compiled with Cython to enable fast
memory access.
"""

from cpython.buffer cimport PyBUF_SIMPLE, Py_buffer, PyObject_GetBuffer
cdef extern int PyObject_AsReadBuffer(object, const void **, Py_ssize_t *)


# These need to match Dataset.axes.variable
DEF VAR_A = 0
DEF VAR_U = 1
DEF VAR_V = 2


ctypedef double[:, :, :, :, :] dataset

cdef struct Lerp1:
    int index
    double lerp

cdef struct Lerp3:
    int hour, lat, lng
    double lerp


cdef class DatasetProxy:
    cdef void* buf
    cdef Py_ssize_t len
    cdef Py_ssize_t[5] shape
    cdef Py_ssize_t[5] strides

    def __init__(object self, object memmap):
        cdef Py_buffer pyb
        cdef const void * cbuf
        IF PY2:
            PyObject_AsReadBuffer(memmap, &cbuf, &self.len)
            self.buf = <void*>cbuf
        ELSE:
            PyObject_GetBuffer(memmap, &pyb, PyBUF_SIMPLE)
            self.buf = pyb.buf
            self.len = pyb.len

        shape = (65, 47, 3, 361, 720)
        for idx, val in enumerate(shape):
            self.shape[idx] = val
        for idx, val in enumerate(shape):
            acc = 8
            for val in shape[idx+1:]:
                acc *= val
            self.strides[idx] = acc

    def __getbuffer__(object self, Py_buffer* view, int flags):
        view.buf = self.buf
        view.len = self.len
        view.shape = self.shape
        view.strides = self.strides
        view.readonly = 0
        view.format = "d"
        view.itemsize = 8
        view.ndim = 5


def make_interpolator(dataset):
    cdef double[:, :, :, :, :] data

    data = DatasetProxy(dataset.array)

    def f(hour, alt, lat, lng):
        return get_wind(data, hour, alt, lat, lng)

    return f


cdef object get_wind(dataset ds,
                     double hour, double lat, double lng, double alt):
    """
    Return [u, v] wind components for the given position.
    Time is in fractional hours since the dataset starts.
    Alt is metres above sea level.
    Lat is latitude in decimal degrees, -90 to +90.
    Lng is longitude in decimal degrees, 0 to 360.

    Returned coordinates are interpolated from the surrounding grid
    points in time, latitude, longitude and altitude.
    """

    cdef Lerp3[8] lerps
    cdef int altidx
    cdef double lower, upper, u, v

    pick3(hour, lat, lng, lerps)

    altidx = search(ds, lerps, alt)
    lower = interp3(ds, lerps, VAR_A, altidx)
    upper = interp3(ds, lerps, VAR_A, altidx + 1)

    if lower != upper:
        lerp = (upper - alt) / (upper - lower)
    else:
        lerp = 0.5

    cdef Lerp1 alt_lerp = Lerp1(altidx, lerp)

    u = interp4(ds, lerps, alt_lerp, VAR_U)
    v = interp4(ds, lerps, alt_lerp, VAR_V)

    return u, v

cdef int pick(double left, double step, int n, double value,
              Lerp1[2] out) except -1:

    cdef double a, l
    cdef int b

    a = (value - left) / step
    b = <int> a
    if b < 0 or b >= n - 1:
        raise ValueError("Value out of range {0}".format(value))
    l = a - b

    out[0] = Lerp1(b, 1 - l)
    out[1] = Lerp1(b + 1, l)
    return 0

cdef int pick3(double hour, double lat, double lng, Lerp3[8] out) except -1:
    cdef Lerp1[2] lhour, llat, llng

    # the dimensions of the lat/lon axes are 361 and 720
    # (The latitude axis includes its two endpoints; the longitude only
    # includes the lower endpoint)
    # However, the longitude does wrap around, so we tell `pick` that the
    # longitude axis is one larger than it is (so that it can "choose" the
    # 721st point/the 360 degrees point), then wrap it afterwards.
    pick(0, 3, 65, hour, lhour)
    pick(-90, 0.5, 361, lat, llat)
    pick(0, 0.5, 720 + 1, lng, llng)
    if llng[1].index == 720:
        llng[1].index = 0

    cdef int i = 0

    for a in lhour:
        for b in llat:
            for c in llng:
                p = a.lerp * b.lerp * c.lerp
                out[i] = Lerp3(a.index, b.index, c.index, p)
                i += 1

    return 0

cdef double interp3(dataset ds, Lerp3[8] lerps, int variable, int level):
    cdef double r, v

    r = 0
    for i in range(8):
        lerp = lerps[i]
        v = ds[lerp.hour, level, variable, lerp.lat, lerp.lng]
        r += v * lerp.lerp

    return r

cdef int search(dataset ds, Lerp3[8] lerps, double target):
    cdef int lower, upper, mid
    cdef double test
    
    lower, upper = 0, 45

    while lower < upper:
        mid = (lower + upper + 1) / 2
        test = interp3(ds, lerps, VAR_A, mid)
        if target <= test:
            upper = mid - 1
        else:
            lower = mid

    return lower

cdef double interp4(dataset ds, Lerp3[8] lerps, Lerp1 alt_lerp, int variable):
    lower = interp3(ds, lerps, variable, alt_lerp.index)
    # and we can infer what the other lerp1 is...
    upper = interp3(ds, lerps, variable, alt_lerp.index + 1)
    return lower * alt_lerp.lerp + upper * (1 - alt_lerp.lerp)
