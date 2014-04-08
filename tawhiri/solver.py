# Copyright 2014 (C) Adam Greig
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
Perform numerical integration of the balloon state.
"""

import calendar


def solve(t, lat, lng, alt, stages):
    """Solve from initial conditions `t`, `lat`, `lng`, and `alt`, using
       models and termination criteria from `stages`, an iterable of (model,
       terminator) pairs which make up each stage of the flight.
    """
    t = calendar.timegm(t.timetuple())
    results = [(t, lat, lng, alt)]
    for model, terminator in stages:
        results += euler(t, lat, lng, alt, model, terminator)
        t, lat, lng, alt = results[-1]
    return results


def euler(t, lat, lng, alt, model, terminator, dt=1.0):
    """Perform forward Euler integration from initial conditions `t`, `lat`,
       `lng` and `alt`, using model `f` and termination criteria `terminator`,
       at timestep `dt`.
    """
    result = []
    while not terminator(t, lat, lng, alt):
        t += dt
        df = model(t, lat, lng, alt)
        lat += df[0] * dt
        lng += df[1] * dt
        alt += df[2] * dt
        result.append((t, lat, lng, alt))
    return result
