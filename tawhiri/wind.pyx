import os
import mmap

DEF SHAPE_T = 65
DEF SHAPE_P = 47
DEF SHAPE_V = 3
DEF SHAPE_LAT = 361
DEF SHAPE_LNG = 720

DEF OFFSET_T = SHAPE_LNG * SHAPE_LAT * SHAPE_V * SHAPE_P
DEF OFFSET_P = SHAPE_LNG * SHAPE_LAT * SHAPE_V
DEF OFFSET_V = SHAPE_LNG * SHAPE_LAT
DEF OFFSET_LAT = SHAPE_LNG

cdef inline double read_var(double[:] data, int t_idx, int p_idx, int v_idx,
                            int lat_idx, int lng_idx):
    cdef int offset = (t_idx * OFFSET_T + p_idx * OFFSET_P +
                       v_idx * OFFSET_V + lat_idx * OFFSET_LAT + lng_idx)
    return data[offset]

cdef class Dataset:
    cdef object fd
    cdef object mm
    cdef double[:] data

    def __init__(self, directory, year, month, day, hour):
        """Open a dataset from a particular time that's in a directory."""
        filename = "{:04d}{:02d}{:02d}{:02d}".format(year, month, day, hour)
        path = os.path.join(directory, filename)
        self.fd = os.open(path, os.O_RDWR)
        self.mm = mmap.mmap(self.fd, 0)
        self.data = memoryview(self.mm).cast("d")

    def __del__(self):
        # do we really need to do this?
        self.mm.close()
        os.close(self.fd)

    def get_wind(self, double time, double alt, double lat, double lng):
        """Return [u, v] wind components for the given position.
           Time is in fractional hours since the dataset starts.
           Alt is metres above sea level.
           Lat is latitude in decimal degrees, -90 to +90.
           Lng is longitude in decimal degrees, 0 to 360.

           Returned coordinates are interpolated from the surrounding grid
           points in time, latitude, longitude and altitude.
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

        cdef double pressure_height
        cdef int p_idx = 0
        cdef int i
        for i in range(47):
            if read_var(self.data, t_idx, i, 0, lat_idx, lng_idx) > alt:
                p_idx = i - 1

        if p_idx < 0:
            p_idx = 0
        elif p_idx > SHAPE_P - 1:
            p_idx = SHAPE_P - 2

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

        a_llll = read_var(self.data, t_idx, p_idx, 0, lat_idx, lng_idx)
        a_lllr = read_var(self.data, t_idx, p_idx, 0, lat_idx, lng_idx + 1)
        a_llrl = read_var(self.data, t_idx, p_idx, 0, lat_idx + 1, lng_idx)
        a_llrr = read_var(self.data, t_idx, p_idx, 0, lat_idx + 1, lng_idx + 1)
        a_lrll = read_var(self.data, t_idx, p_idx + 1, 0, lat_idx, lng_idx)
        a_lrlr = read_var(self.data, t_idx, p_idx + 1, 0, lat_idx, lng_idx + 1)
        a_lrrl = read_var(self.data, t_idx, p_idx + 1, 0, lat_idx + 1, lng_idx)
        a_lrrr = read_var(self.data, t_idx, p_idx + 1, 0, lat_idx + 1, lng_idx + 1)
        a_rlll = read_var(self.data, t_idx + 1, p_idx, 0, lat_idx, lng_idx)
        a_rllr = read_var(self.data, t_idx + 1, p_idx, 0, lat_idx, lng_idx + 1)
        a_rlrl = read_var(self.data, t_idx + 1, p_idx, 0, lat_idx + 1, lng_idx)
        a_rlrr = read_var(self.data, t_idx + 1, p_idx, 0, lat_idx + 1, lng_idx + 1)
        a_rrll = read_var(self.data, t_idx + 1, p_idx + 1, 0, lat_idx, lng_idx)
        a_rrlr = read_var(self.data, t_idx + 1, p_idx + 1, 0, lat_idx, lng_idx + 1)
        a_rrrl = read_var(self.data, t_idx + 1, p_idx + 1, 0, lat_idx + 1, lng_idx)
        a_rrrr = read_var(self.data, t_idx + 1, p_idx + 1, 0, lat_idx + 1,
                                lng_idx + 1)

        u_llll = read_var(self.data, t_idx, p_idx, 1, lat_idx, lng_idx)
        u_lllr = read_var(self.data, t_idx, p_idx, 1, lat_idx, lng_idx + 1)
        u_llrl = read_var(self.data, t_idx, p_idx, 1, lat_idx + 1, lng_idx)
        u_llrr = read_var(self.data, t_idx, p_idx, 1, lat_idx + 1, lng_idx + 1)
        u_lrll = read_var(self.data, t_idx, p_idx + 1, 1, lat_idx, lng_idx)
        u_lrlr = read_var(self.data, t_idx, p_idx + 1, 1, lat_idx, lng_idx + 1)
        u_lrrl = read_var(self.data, t_idx, p_idx + 1, 1, lat_idx + 1, lng_idx)
        u_lrrr = read_var(self.data, t_idx, p_idx + 1, 1, lat_idx + 1, lng_idx + 1)
        u_rlll = read_var(self.data, t_idx + 1, p_idx, 1, lat_idx, lng_idx)
        u_rllr = read_var(self.data, t_idx + 1, p_idx, 1, lat_idx, lng_idx + 1)
        u_rlrl = read_var(self.data, t_idx + 1, p_idx, 1, lat_idx + 1, lng_idx)
        u_rlrr = read_var(self.data, t_idx + 1, p_idx, 1, lat_idx + 1, lng_idx + 1)
        u_rrll = read_var(self.data, t_idx + 1, p_idx + 1, 1, lat_idx, lng_idx)
        u_rrlr = read_var(self.data, t_idx + 1, p_idx + 1, 1, lat_idx, lng_idx + 1)
        u_rrrl = read_var(self.data, t_idx + 1, p_idx + 1, 1, lat_idx + 1, lng_idx)
        u_rrrr = read_var(self.data, t_idx + 1, p_idx + 1, 1, lat_idx + 1,
                                lng_idx + 1)

        v_llll = read_var(self.data, t_idx, p_idx, 2, lat_idx, lng_idx)
        v_lllr = read_var(self.data, t_idx, p_idx, 2, lat_idx, lng_idx + 1)
        v_llrl = read_var(self.data, t_idx, p_idx, 2, lat_idx + 1, lng_idx)
        v_llrr = read_var(self.data, t_idx, p_idx, 2, lat_idx + 1, lng_idx + 1)
        v_lrll = read_var(self.data, t_idx, p_idx + 1, 2, lat_idx, lng_idx)
        v_lrlr = read_var(self.data, t_idx, p_idx + 1, 2, lat_idx, lng_idx + 1)
        v_lrrl = read_var(self.data, t_idx, p_idx + 1, 2, lat_idx + 1, lng_idx)
        v_lrrr = read_var(self.data, t_idx, p_idx + 1, 2, lat_idx + 1, lng_idx + 1)
        v_rlll = read_var(self.data, t_idx + 1, p_idx, 2, lat_idx, lng_idx)
        v_rllr = read_var(self.data, t_idx + 1, p_idx, 2, lat_idx, lng_idx + 1)
        v_rlrl = read_var(self.data, t_idx + 1, p_idx, 2, lat_idx + 1, lng_idx)
        v_rlrr = read_var(self.data, t_idx + 1, p_idx, 2, lat_idx + 1, lng_idx + 1)
        v_rrll = read_var(self.data, t_idx + 1, p_idx + 1, 2, lat_idx, lng_idx)
        v_rrlr = read_var(self.data, t_idx + 1, p_idx + 1, 2, lat_idx, lng_idx + 1)
        v_rrrl = read_var(self.data, t_idx + 1, p_idx + 1, 2, lat_idx + 1, lng_idx)
        v_rrrr = read_var(self.data, t_idx + 1, p_idx + 1, 2, lat_idx + 1,
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

