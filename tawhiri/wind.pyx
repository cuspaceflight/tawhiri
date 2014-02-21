import os
import mmap
import struct
import bisect
import numpy as np

cdef class Dataset:

    cdef int[5] shape
    cdef int item_size
    cdef int t_idx
    cdef int p_idx
    cdef int v_idx
    cdef int l_idx

    cdef object fd
    cdef object mm

    unpacker = struct.Struct("<d")

    def __init__(self):
        self.shape[0] = 65
        self.shape[1] = 47
        self.shape[2] = 3
        self.shape[3] = 361
        self.shape[4] = 720
        self.item_size = 8
        self.t_idx = self.shape[4] * self.shape[3] * self.shape[2] * self.shape[1]
        self.p_idx = self.shape[4] * self.shape[3] * self.shape[2]
        self.v_idx = self.shape[4] * self.shape[3]
        self.l_idx = self.shape[4]

    def open_dataset(self, directory, year, month, day, hour):
        """Open a dataset from a particular time that's in a directory."""
        filename = "{:04d}{:02d}{:02d}{:02d}".format(year, month, day, hour)
        path = os.path.join(directory, filename)
        self.fd = os.open(path, os.O_RDONLY)
        self.mm = mmap.mmap(self.fd, 0, prot=mmap.PROT_READ)

    def __del__(self):
        self.mm.close()
        os.close(self.fd)

    cdef double _read_var(self, int time_idx, int pressure_idx,
                          int var_idx, int lat_idx, int lng_idx):
        """Read one double from the mmap at the given index."""
        cdef int offset = self.item_size * (
            time_idx * self.t_idx + pressure_idx * self.p_idx +
            var_idx * self.v_idx + lat_idx * self.l_idx + lng_idx)
        self.mm.seek(offset)
        return self.unpacker.unpack(self.mm.read(self.item_size))[0]

    def get_pressure_heights(self, time, lat, lng):
        """Return a list of pressure heights for a given time and location."""
        t_idx = int(time / 3.0)
        lat_idx = int((lat + 90.0) * 2)
        lng_idx = int(lng * 2)
        return tuple(self._read_var(t_idx, i, 0, lat_idx, lng_idx)
                for i in range(self.shape[1]))
    
    cpdef public object get_wind(self, double time, double alt, double lat,
                                    double lng, object pressure_heights):
        """Return [u, v] wind components for the given position.
           Time is in fractional hours since the dataset starts.
           Alt is metres above sea level.
           Lat is latitude in decimal degrees, -90 to +90.
           Lng is longitude in decimal degrees, 0 to 360.

           Returned coordinates are interpolated from the surrounding grid
           points in time, latitude, longitude and altitude.

           Optional pressure_heights is result of get_pressure_heights for
           a suitable position. Calculated for current position if not
           specified.
        """
        cdef double t_val = time / 3.0
        cdef int t_idx = int(t_val)
        cdef double t_lerp = t_val - t_idx
        cdef double t_lerp_m = 1.0 - t_lerp
        
        cdef double lat_val = (lat + 90.0) * 2.0
        cdef int lat_idx = int(lat_val)
        cdef double lat_lerp = lat_val - lat_idx
        cdef double lat_lerp_m = 1.0 - lat_lerp

        cdef double lng_val = lng * 2.0
        cdef int lng_idx = int(lng_val)
        cdef double lng_lerp = lng_val - lng_idx
        cdef double lng_lerp_m = 1.0 - lng_lerp
        
        #if pressure_heights is None:
            #pressure_heights = self.get_pressure_heights(time, lat, lng)

        cdef int p_idx = bisect.bisect(pressure_heights, alt) - 1

        if p_idx < 0:
            p_idx = 0
        elif p_idx > self.shape[1] - 1:
            p_idx = self.shape[1] - 2

        cdef double a_llll, a_lllr, a_llrl, a_llrr, a_lrll, a_lrrl, a_lrrr
        cdef double a_rlll, a_rllr, a_rlrl, a_rlrr, a_rrll, a_rrrl, a_rrrr
        cdef double u_llll, u_lllr, u_llrl, u_llrr, u_lrll, u_lrrl, u_lrrr
        cdef double u_rlll, u_rllr, u_rlrl, u_rlrr, u_rrll, u_rrrl, u_rrrr
        cdef double v_llll, v_lllr, v_llrl, v_llrr, v_lrll, v_lrrl, v_lrrr
        cdef double v_rlll, v_rllr, v_rlrl, v_rlrr, v_rrll, v_rrrl, v_rrrr
        cdef double a_lll, a_llr, a_lrl, a_lrr
        cdef double a_rll, a_rlr, a_rrl, a_rrr
        cdef double u_lll, u_llr, u_lrl, u_lrr
        cdef double u_rll, u_rlr, u_rrl, u_rrr
        cdef double v_lll, v_llr, v_lrl, v_lrr
        cdef double v_rll, v_rlr, v_rrl, v_rrr
        cdef double a_ll, a_lr, a_rl, a_rr
        cdef double u_ll, u_lr, u_rl, u_rr
        cdef double v_ll, v_lr, v_rl, v_rr
        cdef double u, v

        a_llll = self._read_var(t_idx, p_idx, 0, lat_idx, lng_idx)
        a_lllr = self._read_var(t_idx, p_idx, 0, lat_idx, lng_idx + 1)
        a_llrl = self._read_var(t_idx, p_idx, 0, lat_idx + 1, lng_idx)
        a_llrr = self._read_var(t_idx, p_idx, 0, lat_idx + 1, lng_idx + 1)
        a_lrll = self._read_var(t_idx, p_idx + 1, 0, lat_idx, lng_idx)
        a_lrlr = self._read_var(t_idx, p_idx + 1, 0, lat_idx, lng_idx + 1)
        a_lrrl = self._read_var(t_idx, p_idx + 1, 0, lat_idx + 1, lng_idx)
        a_lrrr = self._read_var(t_idx, p_idx + 1, 0, lat_idx + 1, lng_idx + 1)
        a_rlll = self._read_var(t_idx + 1, p_idx, 0, lat_idx, lng_idx)
        a_rllr = self._read_var(t_idx + 1, p_idx, 0, lat_idx, lng_idx + 1)
        a_rlrl = self._read_var(t_idx + 1, p_idx, 0, lat_idx + 1, lng_idx)
        a_rlrr = self._read_var(t_idx + 1, p_idx, 0, lat_idx + 1, lng_idx + 1)
        a_rrll = self._read_var(t_idx + 1, p_idx + 1, 0, lat_idx, lng_idx)
        a_rrlr = self._read_var(t_idx + 1, p_idx + 1, 0, lat_idx, lng_idx + 1)
        a_rrrl = self._read_var(t_idx + 1, p_idx + 1, 0, lat_idx + 1, lng_idx)
        a_rrrr = self._read_var(t_idx + 1, p_idx + 1, 0, lat_idx + 1,
                                lng_idx + 1)

        u_llll = self._read_var(t_idx, p_idx, 1, lat_idx, lng_idx)
        u_lllr = self._read_var(t_idx, p_idx, 1, lat_idx, lng_idx + 1)
        u_llrl = self._read_var(t_idx, p_idx, 1, lat_idx + 1, lng_idx)
        u_llrr = self._read_var(t_idx, p_idx, 1, lat_idx + 1, lng_idx + 1)
        u_lrll = self._read_var(t_idx, p_idx + 1, 1, lat_idx, lng_idx)
        u_lrlr = self._read_var(t_idx, p_idx + 1, 1, lat_idx, lng_idx + 1)
        u_lrrl = self._read_var(t_idx, p_idx + 1, 1, lat_idx + 1, lng_idx)
        u_lrrr = self._read_var(t_idx, p_idx + 1, 1, lat_idx + 1, lng_idx + 1)
        u_rlll = self._read_var(t_idx + 1, p_idx, 1, lat_idx, lng_idx)
        u_rllr = self._read_var(t_idx + 1, p_idx, 1, lat_idx, lng_idx + 1)
        u_rlrl = self._read_var(t_idx + 1, p_idx, 1, lat_idx + 1, lng_idx)
        u_rlrr = self._read_var(t_idx + 1, p_idx, 1, lat_idx + 1, lng_idx + 1)
        u_rrll = self._read_var(t_idx + 1, p_idx + 1, 1, lat_idx, lng_idx)
        u_rrlr = self._read_var(t_idx + 1, p_idx + 1, 1, lat_idx, lng_idx + 1)
        u_rrrl = self._read_var(t_idx + 1, p_idx + 1, 1, lat_idx + 1, lng_idx)
        u_rrrr = self._read_var(t_idx + 1, p_idx + 1, 1, lat_idx + 1,
                                lng_idx + 1)

        v_llll = self._read_var(t_idx, p_idx, 2, lat_idx, lng_idx)
        v_lllr = self._read_var(t_idx, p_idx, 2, lat_idx, lng_idx + 1)
        v_llrl = self._read_var(t_idx, p_idx, 2, lat_idx + 1, lng_idx)
        v_llrr = self._read_var(t_idx, p_idx, 2, lat_idx + 1, lng_idx + 1)
        v_lrll = self._read_var(t_idx, p_idx + 1, 2, lat_idx, lng_idx)
        v_lrlr = self._read_var(t_idx, p_idx + 1, 2, lat_idx, lng_idx + 1)
        v_lrrl = self._read_var(t_idx, p_idx + 1, 2, lat_idx + 1, lng_idx)
        v_lrrr = self._read_var(t_idx, p_idx + 1, 2, lat_idx + 1, lng_idx + 1)
        v_rlll = self._read_var(t_idx + 1, p_idx, 2, lat_idx, lng_idx)
        v_rllr = self._read_var(t_idx + 1, p_idx, 2, lat_idx, lng_idx + 1)
        v_rlrl = self._read_var(t_idx + 1, p_idx, 2, lat_idx + 1, lng_idx)
        v_rlrr = self._read_var(t_idx + 1, p_idx, 2, lat_idx + 1, lng_idx + 1)
        v_rrll = self._read_var(t_idx + 1, p_idx + 1, 2, lat_idx, lng_idx)
        v_rrlr = self._read_var(t_idx + 1, p_idx + 1, 2, lat_idx, lng_idx + 1)
        v_rrrl = self._read_var(t_idx + 1, p_idx + 1, 2, lat_idx + 1, lng_idx)
        v_rrrr = self._read_var(t_idx + 1, p_idx + 1, 2, lat_idx + 1,
                                lng_idx + 1)

        a_lll = a_llll * t_lerp_m + a_rlll * t_lerp
        a_llr = a_lllr * t_lerp_m + a_rllr * t_lerp
        a_lrl = a_llrl * t_lerp_m + a_rlrl * t_lerp
        a_lrr = a_llrr * t_lerp_m + a_rlrr * t_lerp
        a_rll = a_lrll * t_lerp_m + a_rrll * t_lerp
        a_rlr = a_lrlr * t_lerp_m + a_rrlr * t_lerp
        a_rrl = a_lrrl * t_lerp_m + a_rrrl * t_lerp
        a_rrr = a_lrrr * t_lerp_m + a_rrrr * t_lerp

        u_lll = u_llll * t_lerp_m + u_rlll * t_lerp
        u_llr = u_lllr * t_lerp_m + u_rllr * t_lerp
        u_lrl = u_llrl * t_lerp_m + u_rlrl * t_lerp
        u_lrr = u_llrr * t_lerp_m + u_rlrr * t_lerp
        u_rll = u_lrll * t_lerp_m + u_rrll * t_lerp
        u_rlr = u_lrlr * t_lerp_m + u_rrlr * t_lerp
        u_rrl = u_lrrl * t_lerp_m + u_rrrl * t_lerp
        u_rrr = u_lrrr * t_lerp_m + u_rrrr * t_lerp

        v_lll = v_llll * t_lerp_m + v_rlll * t_lerp
        v_llr = v_lllr * t_lerp_m + v_rllr * t_lerp
        v_lrl = v_llrl * t_lerp_m + v_rlrl * t_lerp
        v_lrr = v_llrr * t_lerp_m + v_rlrr * t_lerp
        v_rll = v_lrll * t_lerp_m + v_rrll * t_lerp
        v_rlr = v_lrlr * t_lerp_m + v_rrlr * t_lerp
        v_rrl = v_lrrl * t_lerp_m + v_rrrl * t_lerp
        v_rrr = v_lrrr * t_lerp_m + v_rrrr * t_lerp

        a_ll = a_lll * lat_lerp_m + a_lrl * lat_lerp
        a_lr = a_llr * lat_lerp_m + a_lrr * lat_lerp
        a_rl = a_rll * lat_lerp_m + a_rrl * lat_lerp
        a_rr = a_rlr * lat_lerp_m + a_rrr * lat_lerp

        u_ll = u_lll * lat_lerp_m + u_lrl * lat_lerp
        u_lr = u_llr * lat_lerp_m + u_lrr * lat_lerp
        u_rl = u_rll * lat_lerp_m + u_rrl * lat_lerp
        u_rr = u_rlr * lat_lerp_m + u_rrr * lat_lerp

        v_ll = v_lll * lat_lerp_m + v_lrl * lat_lerp
        v_lr = v_llr * lat_lerp_m + v_lrr * lat_lerp
        v_rl = v_rll * lat_lerp_m + v_rrl * lat_lerp
        v_rr = v_rlr * lat_lerp_m + v_rrr * lat_lerp

        a_l = a_ll * lng_lerp_m + a_lr * lng_lerp
        a_r = a_rl * lng_lerp_m + a_rr * lng_lerp

        u_l = u_ll * lng_lerp_m + u_lr * lng_lerp
        u_r = u_rl * lng_lerp_m + u_rr * lng_lerp

        v_l = v_ll * lng_lerp_m + v_lr * lng_lerp
        v_r = v_rl * lng_lerp_m + v_rr * lng_lerp

        cdef double p_lerp = ((alt - a_l) / (a_r - a_l))
        cdef double p_lerp_m = 1.0 - p_lerp

        u = u_l * p_lerp_m + u_r * p_lerp
        v = v_l * p_lerp_m + v_r * p_lerp

        return u, v

