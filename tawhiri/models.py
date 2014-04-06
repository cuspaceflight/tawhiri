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
Provide all the balloon models, termination conditions and
functions to combine models and termination conditions.
"""

import math

_PI_180 = math.pi / 180.0
_180_PI = 180.0 / math.pi


def make_constant_ascent(ascent_rate):
    """Return a constant-ascent model at `ascent_rate`.
    """
    def constant_ascent(t, lat, lng, alt):
        return 0.0, 0.0, ascent_rate
    return constant_ascent


def make_drag_descent(sea_level_descent_rate):
    """Return a descent-under-parachute model with sea level descent
       `sea_level_descent_rate`. Descent rate at altitude is determined
       using an altitude model courtesy of NASA:
       http://www.grc.nasa.gov/WWW/K-12/airplane/atmosmet.html

       For a given altitude the air density is computed, a drag coefficient is
       estimated from the sea level descent rate, and the resulting terminal
       velocity is computed by the returned model function.
    """
    def density(alt):
        temp = pressure = 0.0
        if alt > 25000:
            temp = -131.21 + 0.00299 * alt
            pressure = 2.488 * ((temp + 273.1)/(216.6)) ** (-11.388)
        elif 11000 < alt <= 25000:
            temp = -56.46
            pressure = 22.65 * math.exp(1.73 - 0.000157 * alt)
        else:
            temp = 15.04 - 0.00649 * alt
            pressure = 101.29 * ((temp + 273.1)/288.08) ** (5.256)
        return pressure / (0.2869*(temp + 273.1))

    drag_coefficient = sea_level_descent_rate * 1.1045

    def drag_descent(t, lat, lng, alt):
        return 0.0, 0.0, -drag_coefficient/math.sqrt(density(alt))
    return drag_descent


def make_wind_velocity(dataset):
    """Return a wind-velocity model, which gives lateral movement at
       the wind velocity for the current time, latitude, longitude and
       altitude. The `dataset` argument is the wind dataset in use.
    """
    def wind_velocity(t, lat, lng, alt):
        u, v = dataset.get_wind(t / 3600.0, alt, lat, lng)
        R = 6371009 + alt
        dlat = _180_PI * v / R
        dlng = _180_PI * u / (R * math.cos(lat * _PI_180))
        return dlat, dlng, 0.0
    return wind_velocity


def make_burst_termination(burst_altitude):
    """Return a burst-termination criteria, which terminations integration
       when the altitude reaches `burst_altitude`.
    """
    def burst_termination(t, lat, lng, alt):
        if alt >= burst_altitude:
            return True
    return burst_termination


def ground_termination(t, lat, lng, alt):
    """A ground termination criteria, which terminations integration when
       the altitude is less than (or equal to) zero.

       Note that this is not a model factory.
    """
    if alt <= 0:
        return True


def make_time_termination(max_time):
    """A time based termination criteria, which terminates integration when
       the current time is greater than `max_time`.

       Currently `max_time` is specified in seconds since the dataset began,
       so should probably be computed accordingly before creating this model.
    """
    def time_termination(t, lat, lng, alt):
        if t > max_time:
            return True
    return time_termination


def make_f(models):
    """Return a model that returns the sum of all the models in `models`.
    """
    def f(t, lat, lng, alt):
        dlat, dlng, dalt = 0.0, 0.0, 0.0
        for model in models:
            d = model(t, lat, lng, alt)
            dlat, dlng, dalt = dlat + d[0], dlng + d[1], dalt + d[2]
        return dlat, dlng, dalt
    return f


def make_any_terminator(terminators):
    """Return a terminator that terminates when any of `terminators` would
       terminate.
    """
    def terminator(t, lat, lng, alt):
        return any(term(t, lat, lng, alt) for term in terminators)
    return terminator
