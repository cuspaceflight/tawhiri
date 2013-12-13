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

"""Complex floating balloon models"""


from __future__ import unicode_literals, print_function, division

from . import Model


class DiurnalFloat(Model):
    """
    Models the effects of sunlight on a floating balloon

    (Vertical veloicty only; latitude & longitude components are zero.)
    """

    def __init__(self, **options):
        raise NotImplementedError

    def __call__(self, x, t):
        raise NotImplementedError
        return 0, 0, alt_dot
