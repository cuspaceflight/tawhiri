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
Model base classes & model utilities

A model is a callable that looks something like this::

    def f(x, time):
        return x_dot

.. function:: f(x, time)

    Return velocities predicted by this model (example function)

    The latitude and longitude "velocities" (`lat_dot` & `lon_dot`)
    are "change in decimal degrees per unit time";
    vertical velocity (`alt_dot`) is just metres per second.

    :type x: ``(latitude, longitude, altitude)``, floats,
             decimal degrees & metres
    :param x: current position
    :type t: :class:`tawhiri.Time`
    :param t: current time
    :rtype: ``(lat_dot, lon_dot, alt_dot)``, all floats

Models must be pure functions, for cleanliness and to facilitate more
complex integration methods.

In some cases, for simplicity, vertical (altitude) and horizontal
(latitude & longitude) motion is considered independently.
A *horizontal model* is a model where `alt_dot` is always zero.
This is enforced by the ODE solver; that is, there is nothing special
in the definition of the model, but if you try to use a model with
non-zero vertical velocity whilst specifying an altitude profile,
an exception (will probably) be raised.
"""


from __future__ import unicode_literals, print_function, division


class Model(object):
    """
    A Model

    A model need not be derived from this class (see duck typing),
    it just exists so that classes may be "annotated" - there's no easier
    way to say "this thing is a model".
    """

    def __call__(self, x, t):
        raise NotImplementedError

class HorizontalModel(Model):
    """
    A Horizontal Model

    Decorative - see :class:`Model`.
    """


class LinearCombination(Model):
    """
    A model that linearly combines several models

    (Indeed, an instance of :class:`LinearCombination` behaves just like,
    and looks like, any other model.)

    When called, it calls each model in `models` in turn, and returns the
    pointwise sum of their returned values.
    """

    def __init__(self, *models):
        self.models = models

    def __call__(self, x, t):
        """Return the sum of the values returned by each `model`"""
        tuples = [m(x, t) for m in self.models]
        lat_dots, lon_dots, alt_dots = zip(tuples)
        return (sum(lat_dots), sum(lon_dots), sum(alt_dots))
