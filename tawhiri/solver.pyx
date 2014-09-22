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

# cython: language_level=3

"""
Perform numerical integration of the balloon state.
"""

def solve(t, lat, lng, alt, chain):
    """Solve from initial conditions `t`, `lat`, `lng`, and `alt`, using
       models and termination criteria from `chain`, an iterable of (model,
       terminator) pairs which make up each stage of the flight.
    """
    results = []
    for model, terminator in chain:
        stage = rk4(t, lat, lng, alt, model, terminator)
        results.append(stage)
        t, lat, lng, alt = stage[-1]
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

cdef double lnglerp(double a, double b, double l):
    cdef double l2

    l2 = 1 - l
    if a > b:
        a, b = b, a
        l, l2 = l2, l

    # distance round one way:  b - a
    # distance around other:   (a + 360) - b
    # (b - a < a - b + 360) = (b - a < 180)
    if b - a < 180.0:
        return l2 * a + l * b
    else:
        return (l2 * (a + 360) + l * b) % 360.0

cdef Vector veclerp(Vector a, Vector b, double l):
    """(1 - l) * a + l * b"""
    cdef Vector r
    r.lat = lerp(a.lat, b.lat, l)
    r.lng = lnglerp(a.lng, b.lng, l)
    r.alt = lerp(a.alt, b.alt, l)
    return r

cdef Vector tuptovec(object tup):
    cdef Vector r
    r.lat, r.lng, r.alt = tup
    return r

# Don't appear to be able to cdef closures / make efficient closures.
cdef class Configuration:
    cdef object model, terminator

    def __init__(self, model, terminator):
        self.model = model
        self.terminator = terminator

    cdef Vector f(self, double t, Vector y) except *:
        return tuptovec(self.model(t, y.lat, y.lng, y.alt))

    cdef bint tc(self, double t, Vector y) except *:
        return self.terminator(t, y.lat, y.lng, y.alt)

def rk4(double t, double lat, double lng, double alt,
        object model, object terminator,
        double dt=60.0, double termination_tolerance=0.01):
    """
    Use RK4 to integrate from initial conditions `t`, `lat`, `lng` and `alt`,
    using model `f` and termination criterion `terminator`, at timestep `dt`.
    """

    cfg = Configuration(model, terminator)

    # the current location
    cdef Vector y
    y.lat, y.lng, y.alt = (lat, lng, alt)

    result = [(t, y.lat, y.lng, y.alt)]

    # rk4 variables
    cdef Vector k1, k2, k3, k4

    # the next point
    cdef double t2
    cdef Vector y2

    while True:
        k1 = cfg.f(t, y)
        k2 = cfg.f(t + dt / 2, vecadd(y, dt / 2, k1))
        k3 = cfg.f(t + dt / 2, vecadd(y, dt / 2, k2))
        k4 = cfg.f(t + dt, vecadd(y, dt, k3))

        # y2 = y + (k1 + 2*k2 + 2*k3 + k4)/6
        y2 = y
        y2 = vecadd(y2, dt / 6, k1)
        y2 = vecadd(y2, dt / 3, k2)
        y2 = vecadd(y2, dt / 3, k3)
        y2 = vecadd(y2, dt / 6, k4)

        t2 = t + dt

        if cfg.tc(t2, y2):
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

    # in case the loop executes zero times
    t3 = t2
    y3 = y2

    while right - left > termination_tolerance:
        mid = (left + right) / 2
        t3 = lerp(t, t2, mid)
        y3 = veclerp(y, y2, mid)

        if cfg.tc(t3, y3):
            right = mid
        else:
            left = mid

    # add the final point to the result
    result.append((t3, y3.lat, y3.lng, y3.alt))
    # the point (t2, y2) is discarded

    return result
