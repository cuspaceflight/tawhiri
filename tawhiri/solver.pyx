# Copyright 2014 (C) Adam Greig, Daniel Richman
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


def solve(t, lat, lng, alt, chain):
    """Solve from initial conditions `t`, `lat`, `lng`, and `alt`, using
       models and termination criteria from `chain`, an iterable of (model,
       terminator) pairs which make up each stage of the flight.
    """
    t = calendar.timegm(t.timetuple())
    # NB: care is taken to not repeat points between stages:
    # the integrator does not include the initial conditions it is given
    # in its output, we include the (first) ics here.
    results = [(t, lat, lng, alt)]
    for model, terminator in chain:
        results += rk4(t, lat, lng, alt, model, terminator)
        t, lat, lng, alt = results[-1]
    return results

# Keeping all the components as separate variables is quite unpleasant.
# We don't want to pay the cost of numpy, or repeatedly boxing and unboxing
# tuples.
# Soln: cython & structs (so that they may be passed & returned by value),
# thin wrapper so that they may be passed to and returned by `f`.

cdef struct Vector:
    double lat
    double lng
    double alt

cdef Vector vecadd(Vector a, double k, Vector b):
    """a + k * b"""
    cdef Vector r
    r.lat = a.lat + k * b.lat
    r.lng = a.lng + k * b.lng
    r.alt = a.alt + k * b.alt
    r.lng %= 360.0
    return r

cdef Vector tuptovec(object tup):
    cdef Vector r
    r.lat, r.lng, r.alt = tup
    return r

def rk4(double t, double lat, double lng, double alt,
        model, terminator, double dt=60.0):
    """
    Use RK4 to integrate from initial conditions `t`, `lat`, `lng` and `alt`,
    using model `f` and termination criterion `terminator`, at timestep `dt`.
    """

    cdef Vector y, k1, k2, k3, k4

    def f(double t, Vector y):
        return tuptovec(model(t, y.lat, y.lng, y.alt))
    def tc(double t, Vector y):
        return terminator(t, y.lat, y.lng, y.alt)

    y.lat, y.lng, y.alt = (lat, lng, alt)

    result = []

    while not tc(t, y):
        k1 = f(t, y)
        k2 = f(t + dt / 2, vecadd(y, dt / 2, k1))
        k3 = f(t + dt / 2, vecadd(y, dt / 2, k2))
        k4 = f(t + dt, vecadd(y, dt, k3))

        y = vecadd(y, dt / 6, k1)
        y = vecadd(y, dt / 3, k2)
        y = vecadd(y, dt / 3, k3)
        y = vecadd(y, dt / 6, k4)
        t += dt

        result.append((t, y.lat, y.lng, y.alt))

    return result
