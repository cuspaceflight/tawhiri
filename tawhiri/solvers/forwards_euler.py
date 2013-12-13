# Copyright (C) 2014 ??
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
Forwards Euler Integration
"""


from __future__ import unicode_literals, print_function, division

from . import Solver
from .. import Time


class ForwardsEuler(Solver):
    """Forwards Euler ODE solver, with time step `dt`"""

    def __init__(self, dt):
        self.dt = dt

    def __call__(self, initial_conditions, model, termination_function):
        raise NotImplementedError

        # something like this?
        x = initial_conditions.x
        t = Time.from_initial_conditions(initial_conditions, 0)

        while True:
            if termination_function(x, t):
                break

            x_dot = model(x, t)
            for i in range(3):
                x[i] += x_dot[i] * self.dt
            t += self.dt

            yield x, t

class ForwardsEulerWithAP(Solver):
    """Forwards Euler ODE solver, with an altitude profile & time step `dt`"""

    def __init__(self, dt):
        self.dt = dt

    def __call__(self, initial_conditions, model, altitude_profile,
                       termination_function):
        raise NotImplementedError
