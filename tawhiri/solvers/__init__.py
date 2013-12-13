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
ODE solving

Armed with some models (and maybe some altitude profiles) and a termination
function, the functions in this module can turn this into a prediction.

A solver is a callable that looks something like::

    def s(initial_conditions, model, termination_condition):
        while not termination_conditions(...):
            x_dot = model(...)
            x += x_dot * dt
            t += dt
            yield x

though of course it has to construct :class:`tawhiri.Time` objects, etc.,
and is not necessarily forwards Euler.

A solver returns something iterable (typically a generator to save memory).
The items in the iterator are ``(position, time)`` tuples, where `position`
is a ``(latitude, longitude, altitude)`` tuple (decimal degrees, metres) and
`time` is a :class:`tawhiri.Time`.

.. function:: s(initial_conditions, model, termination_condition)

    Run a prediction (example function)

    :type initial_conditions: :class:`tawhiri.InitialConditions`
    :param initial_conditions: Initial location and time
    :type model: a *horizontal* model
    :param model: The model to use (ODE to solve)
    :type termination_condition: a termination conditon
    :param termination_condition: A function that determines when the
                                  prediction should stop
    :rtype: iterator containing ``((latitude, longitude, altitude), time)``
            tuples; the first three being floats and `time` a
            :class:`tawhiri.Time`

In some cases, for simplicity, vertical (altitude) and horizontal
(latitude & longitude) motion is considered independently, using a
horiziontal model (a model where `alt_dot` is always zero) and an
altitude profile. This requires a slightly modified solver, which looks
something like::

    def s2(initial_conditions, model, altitude_profile,
           termination_condition):
        while not termination_conditions(...):
            x_dot = model(...)
            assert x_dot[2] == 0
            x += x_dot * dt
            x[2] = altitude_profile(...)
            t += dt
            yield x

.. function:: s2(initial_conditions, model, altitude_profile,
                 termination_condition)

    Run a prediction (example function)

    :type initial_conditions: :class:`tawhiri.InitialConditions`
    :param initial_conditions: Initial location and time
    :type model: a *horizontal* model
    :param model: The model to use (ODE to solve)
    :type altitude_profile: an altitude profile
    :param altitude_profile: An altitude profile to use
    :type termination_condition: a termination conditon
    :param termination_condition: A function that determines when the
                                  prediction should stop
    :rtype: iterator containing ``((latitude, longitude, altitude), time)``
            tuples; the first three being floats and `time` a
            :class:`tawhiri.Time`

.. seealso::

    Models & horizontal models: :mod:`tawhiri.models`
    Altitude profiles: :mod:`tawhiri.models.altitude_profiles`
    Termination conditions :mod:`tawhiri.models.termination`

Several configurations may be chained together, with one picking up
and continuing the prediction after the previous one terminates.
"""


from __future__ import unicode_literals, print_function, division

from .. import Time, InitialConditions


class Solver(object):
    """
    A Solver

    A solver need not be derived from this class (indeed, solvers may
    merely be functions; see duck typing), it just exists so that
    classes may be "annotated" - there's no easier way to say "this
    thing is a solver".
    """

    def __call__(self, initial_conditions, model, termination_condition):
        raise NotImplementedError

class SolverWithAP(object):
    """
    A Solver that uses an altitude profile

    Decorative - see :class:`Solver`.
    """

    def __call__(self, initial_conditions, model, altitude_profile,
                       termination_condition):
        raise NotImplementedError


class Configuration(object):
    """
    All the bits needed to run a prediction (or an item in a chain).
    
    .. attribute:: solver

        The solver, which should be a callable taking arguments
        ``(initial_conditions, model, termination_condition)`` if
        :attr:`altitude_profile` is None, and
        ``(initial_conditions, model, altitude_profile,
        termination_condition)`` otherwise.

    .. attribute:: model

        The model to use
        
        .. seealso:: :mod:`tawhiri.models`

    .. attribute:: termination_condition

        The termination condition for this item

        .. seealso:: :mod:`tawhiri.models.termination`

    .. attribute:: altitude_profile

        Optional (and if specified, requires a different kind of
        :attr:`solver`) - the altitude profile

        .. seealso:: :mod:`tawhiri.models.altitude_profile`

    """

    def __init__(self, solver, initial_conditions, model,
                       termination_condition, altitude_profile=None):
        self.solver = solver
        self.initial_conditions = initial_conditions
        self.model = model
        self.altitude_profile = altitude_profile
        self.termination_condition = termination_condition

    def run(self, initial_conditions):
        """
        Run the solver, starting from `initial_conditions`
        
        :attr:`solver` is called with `initial_conditions` and the
        appropriate combination of attributes, and its result is
        returned (if the solver is a generator, then this function
        will "look like" a generator).
        """

        if self.altitude_profile:
            return self.solver(initial_conditions, self.model,
                               self.altitude_profile,
                               self.termination_condition)
        else:
            return self.solver(initial_conditions, self.model,
                               self.termination_condition)

def run_chain(initial_conditions, chain):
    """
    Run each item in a chain of configurations

    Each item in `chain` should have a `run` method which runs some
    solver (specifically, we want the run method to return the iterable
    we expect from a solver).

    The last position and time from an item in the chain is fed as the
    initial conditions to the next.

    `chain` may be a generator, for some more exotic setups.
    """

    for item in chain:
        # in case the solver yields no points / terminates instantly
        last = (initial_conditions.x,
                Time.from_initial_conditions(initial_conditions, 0))

        for point in item.run(initial_conditions):
            yield point
            last = point

        initial_conditions = \
                InitialConditions(last[0], last[1].now, last[1].flight_time)

def decimate(solution, timestep=None, nth=None):
    """
    Decimate the output of a solver

    Specify exactly one of `timestep` or `nth`.
    The former reduces the output so that points are at least `timestep`
    seconds apart; the latter takes every `nth` point.
    """

    if not ((timestep is None) ^ (nth is None)):
        raise ValueError("Specify exactly one of timestep and nth")

    if timestep is not None:
        last = None
        for x, t in solution:
            # TODO: floats. This should compare with a tolerance.
            if last is None or last + timestep <= t.flight_time:
                last = x, t
                yield x, t

    else:
        for i, (x, t) in enumerate(solution):
            if i % nth == 0:
                yield x, t

        # always yield the last point
        if i % nth != 0:
            yield x, t
