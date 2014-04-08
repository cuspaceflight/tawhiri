# Copyright 2014 (C) Daniel Richman
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

"""
Load a wind dataset from file by memory mapping
"""

from collections import namedtuple
import mmap
import os
import os.path
import operator
from datetime import datetime
import logging

logger = logging.getLogger("tawhiri.dataset")


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
        [x/2.0 for x in range(-180, 180 + 1)],
        [x/2.0 for x in range(0, 720)]
    )

    _listdir_type = namedtuple("dataset_in_row",
                ("ds_time", "suffix", "filename", "path"))

    assert shape == tuple(len(x) for x in axes)

    element_type = 'float64'
    element_size = 8    # float64

    size = reduce(operator.mul, shape, element_size)

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
    def open_latest(cls, directory):
        datasets = Dataset.listdir(directory, only_suffices=('', ))
        latest = sorted(datasets, reverse=True)[0]
        return Dataset(directory, latest.ds_time)

    def __init__(self, directory, ds_time, new=False):
        self.directory = directory
        self.ds_time = ds_time
        self.new = new

        self.fn = self.filename(self.directory, self.ds_time)

        prot = mmap.PROT_READ
        flags = mmap.MAP_SHARED

        if new:
            mode = "w+b"
            prot |= mmap.PROT_WRITE
            msg = "truncate and write"
        else:
            mode = "rb"
            msg = "read"
            # XXX Cython doesn't appear to let us cast a read only memoryview
            # to some sort of const/read only double array.
            # This hack/workaround requires vm.overcommit_memory = 1
            # (mmaps always succeed/infinite overcommit): the kernel is
            # obviously a bit touchy about giving us 18G of memory---but
            # we promise to not to write to it, so it's efficively shared.
            flags = mmap.MAP_PRIVATE
            prot |= mmap.PROT_WRITE

        logger.info("Opening dataset %s %s (%s)", self.ds_time, self.fn, msg)

        with open(self.fn, mode) as f:
            if new:
                f.seek(self.size - 1)
                f.write("\0")
            else:
                f.seek(0, 2)
                sz = f.tell()
                if sz != self.size:
                    raise ValueError("Dataset should be {0} bytes (was {1})"
                                        .format(self.size, sz))
            f.seek(0, 0)

            self.array = mmap.mmap(f.fileno(), 0, prot=prot, flags=flags)

    def __del__(self):
        self.close()

    def close(self):
        if hasattr(self, 'array'):
            logger.info("Closing dataset %s %s", self.ds_time, self.fn)
            del self.array
