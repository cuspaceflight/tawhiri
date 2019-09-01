# Copyright 2016 Daniel Richman
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
# cython: language_level=3

"""
A WarningCounts object is a set of flags that record which warnings have
fired, and how many times they have fired.
"""

cdef class WarningCounts:
    def __init__(self):
        self.altitude_too_high = 0

    @property
    def any(self):
        return bool(self.altitude_too_high)

    def to_dict(self):
        res = \
            { "altitude_too_high":
                { "count": self.altitude_too_high
                , "description": "The altitude went too high, above the max forecast wind. "
                                 "Wind data will be unreliable"
                }
            }

        for key in list(res.keys()):
            if res[key]["count"] == 0:
                del res[key]

        return res
