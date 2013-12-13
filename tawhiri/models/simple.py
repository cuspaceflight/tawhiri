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

"""A collection of basic Models"""


from __future__ import unicode_literals, print_function, division

from . import HorizontalModel


class Wind(HorizontalModel):
    """A horizontal model that assumes the balloon moves at wind speed"""

    def __init__(self, dataset):
        self.dataset = dataset

    def __call__(self, x, t):
        offset = (t.now - self.dataset.ds_time).total_seconds()
        # TODO: implement tawhiri.wind.Dataset.get_wind(hour, alt, lat, lon)
        wind_u, wind_v = self.dataset.get_wind(offset / 3600, x[2], x[0], x[1])
        # TODO: convert wind_{u,v} to dl{at,on}/dt
        return wind_u, wind_v, 0
