# Cython compiler directives:
# cython: boundscheck=False
# cython: wraparound=False

import mmap
import os.path

DEF VAR_A = 0
DEF VAR_U = 1
DEF VAR_V = 2

cdef class Dataset:
    cdef object fd, mm
    cdef double[:, :, :, :, :] data

    def __init__(self, directory, year, month, day, hour):
        """Open a dataset from a particular time that's in a directory."""
        filename = "{:04d}{:02d}{:02d}{:02d}".format(year, month, day, hour)
        path = os.path.join(directory, filename)
        self.fd = open(path, "wb")
        self.mm = mmap.mmap(self.fd.fileno(), 0)
        self.data = memoryview(self.mm).cast("d", (65, 47, 3, 361, 720))

    def get_wind(self, double time, double alt, double lat, double lng):
        """Return [u, v] wind components for the given position.
           Time is in fractional hours since the dataset starts.
           Alt is metres above sea level.
           Lat is latitude in decimal degrees, -90 to +90.
           Lng is longitude in decimal degrees, 0 to 360.

           Returned coordinates are interpolated from the surrounding grid
           points in time, latitude, longitude and altitude.
        """
        cdef unsigned int t_idx, lat_idx, lng_idx, p_idx, i, j, k

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
            if self.data[t_idx, i, VAR_A, lat_idx, lng_idx] > alt:
                p_idx = i - 1
                break

        if p_idx < 0:
            p_idx = 0
        elif p_idx > 46:
            p_idx = 45

        a_l = self._lerp_t(p_idx, t_lerp, t_idx,
                           lat_lerp, lat_idx, lng_lerp, lng_idx,
                           VAR_A)
        a_h = self._lerp_t(p_idx + 1, t_lerp, t_idx,
                           lat_lerp, lat_idx, lng_lerp, lng_idx,
                           VAR_A)
        p_lerp = ((alt - a_l) / (a_h - a_l))

        u = self._lerp_p(p_lerp, p_idx, t_lerp, t_idx,
                         lat_lerp, lat_idx, lng_lerp, lng_idx,
                         VAR_U)
        v = self._lerp_p(p_lerp, p_idx, t_lerp, t_idx,
                                     lat_lerp, lat_idx, lng_lerp, lng_idx,
                                     VAR_V)
        return u, v

    cdef double _lerp_p(self,
                        double p_lerp, unsigned int p_idx,
                        double t_lerp, unsigned int t_idx,
                        double lat_lerp, unsigned int lat_idx,
                        double lng_lerp, unsigned int lng_idx,
                        unsigned int var):
        var_l = self._lerp_t(p_idx, t_lerp, t_idx,
                             lat_lerp, lat_idx, lng_lerp, lng_idx,
                             var)
        var_h = self._lerp_t(p_idx + 1, t_lerp, t_idx,
                             lat_lerp, lat_idx, lng_lerp, lng_idx,
                             var)
        p_lerp_m = 1.0 - p_lerp
        return var_l * p_lerp_m + var_h * p_lerp

    cdef double _lerp_t(self,
                        unsigned int p_idx,
                        double t_lerp, unsigned int t_idx,
                        double lat_lerp, unsigned int lat_idx,
                        double lng_lerp, unsigned int lng_idx,
                        unsigned int var):
        var_l = self._lerp_lat(p_idx, t_idx, lat_lerp, lat_idx,
                               lng_lerp, lng_idx, var)
        var_h = self._lerp_lat(p_idx, t_idx + 1, lat_lerp, lat_idx,
                               lng_lerp, lng_idx, var)
        t_lerp_m = 1.0 - t_lerp
        return var_l * t_lerp_m + var_h * t_lerp

    cdef double _lerp_lat(self,
                          unsigned int p_idx, unsigned int t_idx,
                          double lat_lerp, unsigned int lat_idx,
                          double lng_lerp, unsigned int lng_idx,
                          unsigned int var):
        var_l = self._lerp_lng(p_idx, t_idx, lat_idx,
                               lng_lerp, lng_idx, var)
        var_h = self._lerp_lng(p_idx, t_idx, lat_idx + 1,
                               lng_lerp, lng_idx, var)
        lat_lerp_m = 1.0 - lat_lerp
        return var_l * lat_lerp_m + var_h * lat_lerp

    cdef double _lerp_lng(self,
                          unsigned int p_idx, unsigned int t_idx,
                          unsigned int lat_idx, double lng_lerp,
                          unsigned int lng_idx, unsigned int var):
        cdef double var_l, var_h
        var_l = self.data[t_idx, p_idx, var, lat_idx, lng_idx]
        var_h = self.data[t_idx, p_idx, var, lat_idx, lng_idx + 1]
        lng_lerp_m = 1.0 - lng_lerp
        return var_l * lng_lerp_m + var_h * lng_lerp
