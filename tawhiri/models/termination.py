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
Termination conditions

A termination condition decides if the prediction should stop. They are
callables that look something like::

    def k(x, t):
        return t.item_time < 1000

.. function:: k(x, t):

    Decides if the prediction should stop (an example function)

    :type x: ``(latitude, longitude, altitude)``, floats,
             decimal degrees & metres
    :param x: current position
    :type t: :class:`tawhiri.Time`
    :param t: current time
    :rtype: bool

Termination functions must be pure.
"""


from __future__ import unicode_literals, print_function, division


class TerminationCondition(object):
    """
    A termination condition

    A termination condition need not be derived from this class (see duck
    typing), it just exists so that classes may be "annotated" - there's
    no easier way to say "this thing is a termination condition".
    """

    def __call__(self, x, t):
        raise NotImplementedError


def landed_msl(x, t):
    """Simple "has the balloon landed" condition (non-positive altitude)"""
    return x[2] < 0

class LandedGroundAltitude(TerminationCondition):
    """Not yet implemented"""
    def __init__(self, amsl_dataset):
        raise NotImplementedError
    def __call__(self, x, t):
        raise NotImplementedError
        return x[2] < self.amsl_dataset.get(x[0], x[1])

class Timeout(TerminationCondition):
    """
    Terminate the prediction after a certain amount of time
    
    :type time: float, seconds
    :param time: maximum value of `item_time`
    """

    def __init__(self, time):
        self.time = time

    def __call__(self, x, t):
        """```t.item_time > self.time```"""
        return t.item_time > self.time
