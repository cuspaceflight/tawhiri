# Copyright 2014 (C) Adam Greig
#
# This file is part of Tawhiri.
#
# habitat is free software: you can redistribute it and/or modify
# it under the terms of the GNU General Public License as published by
# the Free Software Foundation, either version 3 of the License, or
# (at your option) any later version.
#
# habitat is distributed in the hope that it will be useful,
# but WITHOUT ANY WARRANTY; without even the implied warranty of
# MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
# GNU General Public License for more details.
#
# You should have received a copy of the GNU General Public License
# along with habitat.  If not, see <http://www.gnu.org/licenses/>.

# Cython compiler directives:
# cython: boundscheck=False
# cython: wraparound=False

"""
Interpolation to determine wind velocity at any given time,
latitude, longitude and altitude.

Note that this module is compiled with Cython to enable fast
memory access.
"""

# These need to match Dataset.axes.variable
DEF VAR_A = 0
DEF VAR_U = 1
DEF VAR_V = 2

def make_interpolator(dataset):
    cdef double[:, :, :, :, :] data

    data = memoryview(dataset.array).cast("d", (65, 47, 3, 361, 720))

    def f(time, alt, lat, lng):
        return get_wind(data, time, alt, lat, lng)

    return f

cdef get_wind(double[:, :, :, :, :] dataset,
              double time, double alt, double lat, double lng):
    """Return [u, v] wind components for the given position.
       Time is in fractional hours since the dataset starts.
       Alt is metres above sea level.
       Lat is latitude in decimal degrees, -90 to +90.
       Lng is longitude in decimal degrees, 0 to 360.

       Returned coordinates are interpolated from the surrounding grid
       points in time, latitude, longitude and altitude.
    """
    cdef int t_idx, lat_idx, lng_idx, p_idx, i

    t_val = time / 3.0
    t_idx = int(t_val)
    t_lerp = t_val - t_idx
    
    lat_val = (lat + 90.0) * 2.0
    lat_idx = int(lat_val)
    lat_lerp = lat_val - lat_idx

    lng_val = lng * 2.0
    lng_idx = int(lng_val)
    lng_lerp = lng_val - lng_idx

    p_idx = 0
    for i in range(47):
        if dataset[t_idx, i, VAR_A, lat_idx, lng_idx] > alt:
            p_idx = i - 1
            break

    if p_idx < 0:
        p_idx = 0
    elif p_idx > 46:
        p_idx = 45

    a_l = _lerp_t(dataset, p_idx, t_lerp, t_idx,
                       lat_lerp, lat_idx, lng_lerp, lng_idx,
                       VAR_A)
    a_h = _lerp_t(dataset, p_idx + 1, t_lerp, t_idx,
                       lat_lerp, lat_idx, lng_lerp, lng_idx,
                       VAR_A)
    p_lerp = ((alt - a_l) / (a_h - a_l))

    u = _lerp_p(dataset, p_lerp, p_idx, t_lerp, t_idx,
                     lat_lerp, lat_idx, lng_lerp, lng_idx,
                     VAR_U)
    v = _lerp_p(dataset, p_lerp, p_idx, t_lerp, t_idx,
                                 lat_lerp, lat_idx, lng_lerp, lng_idx,
                                 VAR_V)
    return u, v

cdef double _lerp_p(double[:, :, :, :, :] dataset,
                    double p_lerp, unsigned int p_idx,
                    double t_lerp, unsigned int t_idx,
                    double lat_lerp, unsigned int lat_idx,
                    double lng_lerp, unsigned int lng_idx,
                    unsigned int var):
    var_l = _lerp_t(dataset, p_idx, t_lerp, t_idx,
                         lat_lerp, lat_idx, lng_lerp, lng_idx,
                         var)
    var_h = _lerp_t(dataset, p_idx + 1, t_lerp, t_idx,
                         lat_lerp, lat_idx, lng_lerp, lng_idx,
                         var)
    p_lerp_m = 1.0 - p_lerp
    return var_l * p_lerp_m + var_h * p_lerp

cdef double _lerp_t(double[:, :, :, :, :] dataset,
                    unsigned int p_idx,
                    double t_lerp, unsigned int t_idx,
                    double lat_lerp, unsigned int lat_idx,
                    double lng_lerp, unsigned int lng_idx,
                    unsigned int var):
    var_l = _lerp_lat(dataset, p_idx, t_idx, lat_lerp, lat_idx,
                           lng_lerp, lng_idx, var)
    var_h = _lerp_lat(dataset, p_idx, t_idx + 1, lat_lerp, lat_idx,
                           lng_lerp, lng_idx, var)
    t_lerp_m = 1.0 - t_lerp
    return var_l * t_lerp_m + var_h * t_lerp

cdef double _lerp_lat(double[:, :, :, :, :] dataset,
                      unsigned int p_idx, unsigned int t_idx,
                      double lat_lerp, unsigned int lat_idx,
                      double lng_lerp, unsigned int lng_idx,
                      unsigned int var):
    var_l = _lerp_lng(dataset, p_idx, t_idx, lat_idx,
                           lng_lerp, lng_idx, var)
    var_h = _lerp_lng(dataset, p_idx, t_idx, lat_idx + 1,
                           lng_lerp, lng_idx, var)
    lat_lerp_m = 1.0 - lat_lerp
    return var_l * lat_lerp_m + var_h * lat_lerp

cdef double _lerp_lng(double[:, :, :, :, :] dataset,
                      unsigned int p_idx, unsigned int t_idx,
                      unsigned int lat_idx, double lng_lerp,
                      unsigned int lng_idx, unsigned int var):
    cdef double var_l, var_h
    var_l = dataset[t_idx, p_idx, var, lat_idx, lng_idx]
    var_h = dataset[t_idx, p_idx, var, lat_idx, lng_idx + 1]
    lng_lerp_m = 1.0 - lng_lerp
    return var_l * lng_lerp_m + var_h * lng_lerp
