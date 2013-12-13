# Copyright (C) 2014 Daniel Richman
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

"""
Altitude Profile

In some cases, for simplicity, vertical (altitude) and horizontal
(latitude & longitude) motion is considered independently.

An altitude profile is a callable that looks something like this::

    def h(time):
        return altitude

.. function h(time):

    Return the current altitude of the balloon (example function)

    :type t: :class:`tawhiri.Time`
    :param time: current time
    :rtype: float, metres

Altitude profiles must be pure.
"""


from __future__ import unicode_literals, print_function, division


class AltitudeProfile(object):
    """
    An altitude profile

    An altitude profile need not be derived from this class (see duck
    typing), it just exists so that classes may be "annotated" - there's
    no easier way to say "this thing is an altitude profile".
    """

    def __call__(self, t):
        raise NotImplementedError


class Linear(AltitudeProfile):
    """Constant speed ascent (or descent), at `speed` metres per second"""

    def __init__(self, speed):
        self.speed = speed

    def __call__(self, time):
        """``time.item_time * self.speed``"""
        return time.item_time * self.speed

class SimpleParachuteDescent(AltitudeProfile):
    """Not yet implemented"""
    def __init__(self, todo):
        raise NotImplementedError

    def __call__(self, time):
        raise NotImplementedError

class Constant(AltitudeProfile):
    """Constant altitude (float)"""
    def __init__(self, altitude):
        self.altitude = altitude

    def __call__(time):
        """``self.altitude``"""
        return self.altitude
