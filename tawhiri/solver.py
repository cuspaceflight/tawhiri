# Copyright 2014 (C) Adam Greig
#
# This file is part of Tawhiri.
#
# habitat is free software: you can redistribute it and/or modify
# it under the terms of the GNU General Public License as published by
# the Free Software Foundation, either version 3 of the License, or
# (at your option) any later version.
#
# habitat is distributed in the hope that it will be useful,
# but WITHOUT ANY WARRANTY; without even the implied warranty of
# MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
# GNU General Public License for more details.
#
# You should have received a copy of the GNU General Public License
# along with habitat.  If not, see <http://www.gnu.org/licenses/>.

"""
Perform numerical integration of the balloon state.
"""


def solve(t, lat, lng, alt, fs, terms, dt):
    """Solve from initial conditions `t`, `lat`, `lng`, and `alt`, using a list
       or iterable of model functions `fs` and corresponding termination
       criteria `terms`, with timestep `dt`.

       Currently uses forward Euler integration so dt should probably be
       kept respectably small.
    """
    results = [(t, lat, lng, alt)]
    for f, term in zip(fs, terms):
        results += euler(t, lat, lng, alt, f, term, dt)
        t, lat, lng, alt = results[-1]
    return results


def euler(t, lat, lng, alt, f, terminator, dt):
    """Perform forward Euler integration from initial conditions `t`, `lat`,
       `lng` and `alt`, using model `f` and termination criteria `terminator`,
       at timestep `dt`.
    """
    result = []
    while not terminator(t, lat, lng, alt):
        t += dt
        df = f(t, lat, lng, alt)
        lat += df[0] * dt
        lng += df[1] * dt
        alt += df[2] * dt
        result.append((t, lat, lng, alt))
    return result
