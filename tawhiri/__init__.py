# Copyright (C) 2013 Daniel Richman
#
# This file is part of tawhiri.
#
# tawhiri is free software: you can redistribute it and/or modify
# it under the terms of the GNU General Public License as published by
# the Free Software Foundation, either version 3 of the License, or
# (at your option) any later version.
#
# tawhiri is distributed in the hope that it will be useful,
# but WITHOUT ANY WARRANTY; without even the implied warranty of
# MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
# GNU General Public License for more details.
#
# You should have received a copy of the GNU General Public License
# along with tawhiri.  If not, see <http://www.gnu.org/licenses/>.

u"""
T\u0101whirim\u0101tea'

CU Spaceflight's balloon landing prediction software.

:copyright: (c) 2013 Daniel Richman.
:license: GNU GPLv3 - see COPYING.
"""

from __future__ import unicode_literals, print_function, division

import numbers

from datetime import timedelta
from collections import namedtuple


__version__ = "0.0.1"


class InitialConditions(object):
    """
    The initial location and time for a prediction

    .. attribute:: x

        Position; ``(latitude, longitude, altitude)``.

        All floats, latitude and longitude in decimal degrees and altitude
        in metres.

    .. attribute:: datetime

        Absolute time at the start of the prediction - typically an
        instance of :class:`datetime.datetime`.

    .. attribute:: flight_time

        This defaults to zero (and probably should be left that way), and
        is used to set the initial conditions of the nth (n >= 1) item in a
        chain of prediction configurations.

    """

    def __init__(self, x, datetime, flight_time=0):
        self.x = x
        self.datetime = datetime
        self.flight_time = flight_time

    def replace_flight_time(self, flight_time):
        """Create a new object, replacing :attr:`flight_time`"""
        return type(self)(self.x, self.datetime, flight_time)

    def copy(self):
        return type(self)(self.x, self.datetime, self.flight_time)


class Time(object):
    """
    Time in a prediction

    .. attribute:: now

        :class:`datetime.datetime`; absolute time.

    .. attribute:: flight_time

        Time since the prediction started (float, seconds).

    .. attribute:: item_time

        Time since this item in the chain that makes up this prediction
        started (float, seconds).

        .. seealso:: :func:`tawhiri.solvers.run_chain`

    """

    __slots__ = ("now", "flight_time", "item_time")

    def __init__(self, now, flight_time, item_time):
        self.now = now
        self.flight_time = flight_time
        self.item_time = item_time

    @classmethod
    def from_initial_conditions(cls, initial_conditions, item_time):
        """
        Create a time offset from some :class:`InitialConditions`
        
        Basically, `now` and `flight_time` have `item_time` seconds added
        to them, `item_time` is used as-is.
        """

        now = initial_conditions.datetime + timedelta(seconds=item_time)
        flight_time = initial_conditions.flight_time + item_time
        return cls(now, flight_time, item_time)

    def __add__(self, other):
        """Add some seconds to a :class:`Time` object"""
        if not isinstance(other, numbers.Real):
            return NotImplemented

        now = self.now + timedelta(seconds=other)
        flight_time = self.flight_time + other
        item_time = self.item_time + other
        return type(self)(now, flight_time, item_time)

    __radd__ = __add__

    def __iadd__(self, other):
        """Add some seconds to this object (modifies in place)"""
        if not isinstance(other, numbers.Real):
            return NotImplemented

        self.now += timedelta(seconds=other)
        self.flight_time += other
        self.item_time += other
        return self
