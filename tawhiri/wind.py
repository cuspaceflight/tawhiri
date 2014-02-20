import os
import mmap
import struct
import bisect
import numpy as np

class Dataset:

    # Datasets have dimensions
    #     time, hours, 0 to 192, every 3
    #     pressure level, mbar
    #     variable [height, wind_u, wind_v]
    #     latitude, -90 to 90, every 0.5
    #     longitude, 0 to 360, every 0.5
    shape = (65, 47, 3, 361, 720)
    item_size = 8

    t_idx = shape[4] * shape[3] * shape[2] * shape[1]
    p_idx = shape[4] * shape[3] * shape[2]
    v_idx = shape[4] * shape[3]
    l_idx = shape[4]

    unpacker = struct.Struct("<d")

    def open_dataset(self, directory, year, month, day, hour):
        """Open a dataset from a particular time that's in a directory."""
        filename = "{:04d}{:02d}{:02d}{:02d}".format(year, month, day, hour)
        path = os.path.join(directory, filename)
        self.fd = os.open(path, os.O_RDONLY)
        self.mm = mmap.mmap(self.fd, 0, prot=mmap.PROT_READ)

    def __del__(self):
        self.mm.close()
        os.close(self.fd)

    def _read_var(self, time_idx, pressure_idx, var_idx, lat_idx, lng_idx):
        """Read one double from the mmap at the given index."""
        offset = self.item_size * (
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
    
    def get_wind(self, time, alt, lat, lng, pressure_heights=None):
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
        t_val = time / 3.0
        t_idx = int(t_val)
        t_lerp = t_val - t_idx
        t_lerp_m = 1.0 - t_lerp
        
        lat_val = (lat + 90.0) * 2.0
        lat_idx = int(lat_val)
        lat_lerp = lat_val - lat_idx
        lat_lerp_m = 1.0 - lat_lerp

        lng_val = lng * 2.0
        lng_idx = int(lng_val)
        lng_lerp = lng_val - lng_idx
        lng_lerp_m = 1.0 - lng_lerp
        
        if pressure_heights is None:
            pressure_heights = self.get_pressure_heights(time, lat, lng)

        p_idx = bisect.bisect(pressure_heights, alt) - 1

        if p_idx < 0:
            p_idx = 0
        elif p_idx > self.shape[1] - 1:
            p_idx = self.shape[1] - 2

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

        p_lerp = ((alt - a_l) / (a_r - a_l))
        p_lerp_m = 1.0 - p_lerp

        u = u_l * p_lerp_m + u_r * p_lerp
        v = v_l * p_lerp_m + v_r * p_lerp

        return u, v

