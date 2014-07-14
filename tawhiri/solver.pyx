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

cdef double lerp(double a, double b, double l):
    return (1 - l) * a + l * b

cdef Vector veclerp(Vector a, Vector b, double l):
    """(1 - l) * a + l * b"""
    cdef Vector r
    r.lat = lerp(a.lat, b.lat, l)
    r.lng = lerp(a.lng, b.lng, l)
    r.alt = lerp(a.alt, b.alt, 1)
    return r

cdef Vector tuptovec(object tup):
    cdef Vector r
    r.lat, r.lng, r.alt = tup
    return r

def rk4(double t, double lat, double lng, double alt,
        object model, object terminator,
        double dt=60.0, double termination_tolerance=0.01):
    """
    Use RK4 to integrate from initial conditions `t`, `lat`, `lng` and `alt`,
    using model `f` and termination criterion `terminator`, at timestep `dt`.
    """

    def f(double t, Vector y):
        return tuptovec(model(t, y.lat, y.lng, y.alt))
    def tc(double t, Vector y):
        return terminator(t, y.lat, y.lng, y.alt)

    # the current location
    cdef Vector y

    y.lat, y.lng, y.alt = (lat, lng, alt)

    result = []

    # rk4 variables
    cdef Vector k1, k2, k3, k4

    # the next point
    cdef double t2
    cdef Vector y2

    while True:
        k1 = f(t, y)
        k2 = f(t + dt / 2, vecadd(y, dt / 2, k1))
        k3 = f(t + dt / 2, vecadd(y, dt / 2, k2))
        k4 = f(t + dt, vecadd(y, dt, k3))

        # y2 = y + (k1 + 2*k2 + 2*k3 + k4)/6
        y2 = y
        y2 = vecadd(y2, dt / 6, k1)
        y2 = vecadd(y2, dt / 3, k2)
        y2 = vecadd(y2, dt / 3, k3)
        y2 = vecadd(y2, dt / 6, k4)

        t2 = t + dt

        if tc(t2, y2):
            # when the termination condition is met,
            # leave the previous point in (t, y) and the next point in
            # (t2, y2) ...
            break

        # otherwise, update the current point and add it to the list.
        t = t2
        y = y2

        result.append((t, y.lat, y.lng, y.alt))

    # ... and binary search to find a point (t3, y3) between
    # (t, y) and (t2, y2) close to where the terminator becomes true
    cdef double left, right
    cdef double t3
    cdef Vector y3

    # binary search for the constant l in [0, 1]
    # such that (t3, y3) = (1 - l) * (t, y) + l * (t2, y2)
    # is near where tc(t3, y3) becomes true
    left = 0.0
    right = 1.0
    t3 = t
    y3 = y

    while right - left < termination_tolerance:
        mid = (left + right) / 2
        t3 = lerp(t, t2, mid)
        y3 = veclerp(y, y2, mid)

        if tc(t3, y3):
            right = mid
        else:
            left = mid

    # add the final point to the result
    result.append((t3, y3.lat, y3.lng, y3.alt))
    # the point (t2, y2) is discarded

    return result
