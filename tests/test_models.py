# Copyright 2014 (C) Adam Greig
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

from __future__ import print_function
from nose.tools import assert_equal, assert_almost_equal
from nose.tools import assert_true, assert_false
from mock import patch, Mock

from tawhiri import models, warnings


class TestModels:

    def test_constant_ascent(self):
        for rate in (0.0, 1.0, -1.0):
            f = models.make_constant_ascent(rate)
            assert_equal(f(0, 0, 0, 0), (0.0, 0.0, rate))

    def test_drag_descent(self):
        # Precomputed values from old C predictor for a few sea level descent
        # rates and altitudes. We can at least make sure we have the same
        # numbers as the old C version which seemed to work well.
        checks = {
            1.0: {
                0.0: -0.99726781,
                1000.0: -1.04680502,
                20000.0: -3.70291569,
                40000.0: -17.72488295
            },
            5.0: {
                0.0: -4.98633903,
                1000.0: -5.23402511,
                20000.0: -18.51457847,
                40000.0: -88.62441475
            },
            10.0: {
                0.0: -9.97267806,
                1000.0: -10.46805022,
                20000.0: -37.02915694,
                40000.0: -177.24882949
            }
        }
        for sldr in checks:
            f = models.make_drag_descent(sldr)
            for alt in checks[sldr]:
                _a, _b, rate = f(0, 0, 0, alt)
                assert_equal(_a, 0.0)
                assert_equal(_b, 0.0)
                assert_almost_equal(rate, checks[sldr][alt])

    @patch('tawhiri.interpolate.make_interpolator')
    @patch('calendar.timegm')
    def test_wind_velocity(self, timegm, make_interpolator):
        ds = Mock()
        timegm.return_value = 10.0
        get_wind = Mock()
        get_wind.return_value = 3.0, -5.0
        make_interpolator.return_value = get_wind

        w = warnings.WarningCounts()
        f = models.make_wind_velocity(ds, w)
        dlat, dlng, zero = f(10.0, 52.0, 0.5, 1000.0)
        assert_equal(zero, 0.0)
        get_wind.assert_called_with(0.0, 52.0, 0.5, 1000.0)

        # Computed by hand
        assert_almost_equal(dlat, -4.495895997e-5)
        assert_almost_equal(dlng, 4.381527359e-5)

        assert not w.any

    def test_burst_termination(self):
        for alt in (0.0, 5000.0, 50000.0):
            f = models.make_burst_termination(alt)
            assert_false(f(0, 0, 0, alt - 1.0))
            assert_true(f(0, 0, 0, alt))
            assert_true(f(0, 0, 0, alt + 1.0))

    def test_sea_level_termination(self):
        f = models.sea_level_termination
        assert_false(f(0, 0, 0, 5000.0))
        assert_false(f(0, 0, 0, 1.0))
        assert_true(f(0, 0, 0, 0.0))
        assert_true(f(0, 0, 0, -1.0))

    def test_elevation_data_termination(self):
        ds = Mock()
        f = models.make_elevation_data_termination(ds)
        ds.get.return_value = 23.0
        assert_false(f(0, 52.0, 0.5, 23.1))
        assert_true(f(0, 52.0, 0.5, 22.9))
        assert_true(f(0, 52.0, 0.5, -5.0))

    def test_time_termination(self):
        f = models.make_time_termination(10.0)
        assert_false(f(0, 0, 0, 0))
        assert_false(f(10, 0, 0, 0))
        assert_true(f(11, 0, 0, 0))
        assert_true(f(50000, 0, 0, 0))

    def test_linear_model(self):
        m1, m2, m3 = Mock(), Mock(), Mock()
        m1.return_value = (1, 1, 1)
        m2.return_value = (2, 2, 2)
        m3.return_value = (3, 3, 3)
        f = models.make_linear_model((m1, m2, m3))
        assert_equal(f(0, 0, 0, 0), (6, 6, 6))
        m1.assert_called_with(0, 0, 0, 0)
        m2.assert_called_with(0, 0, 0, 0)
        m3.assert_called_with(0, 0, 0, 0)

    def test_any_terminator(self):
        t1, t2, t3 = Mock(), Mock(), Mock()
        f = models.make_any_terminator((t1, t2, t3))

        t1.return_value = t2.return_value = t3.return_value = False
        assert_false(f(0, 0, 0, 0))
        t1.assert_called_with(0, 0, 0, 0)
        t2.assert_called_with(0, 0, 0, 0)
        t3.assert_called_with(0, 0, 0, 0)

        t1.return_value = True
        assert_true(f(1, 1, 1, 1))
        t1.assert_called_with(1, 1, 1, 1)
        t1.return_value = False

        t2.return_value = True
        assert_true(f(2, 2, 2, 2))
        t2.assert_called_with(2, 2, 2, 2)
        t2.return_value = False

        t3.return_value = True
        assert_true(f(3, 3, 3, 3))
        t3.assert_called_with(3, 3, 3, 3)
        t3.return_value = False

    @patch('tawhiri.models.make_linear_model')
    @patch('tawhiri.models.make_constant_ascent')
    @patch('tawhiri.models.make_wind_velocity')
    @patch('tawhiri.models.make_burst_termination')
    @patch('tawhiri.models.make_drag_descent')
    @patch('tawhiri.models.make_elevation_data_termination')
    def test_standard_profile(self, elev, drag, burst, wind, const, linear):
        warns = warnings.WarningCounts()
        wind_ds = Mock()
        elev_ds = Mock()
        const.return_value = 'const'
        wind.return_value = 'wind'
        linear.return_value = 'linear'
        burst.return_value = 'burst'
        drag.return_value = 'drag'
        elev.return_value = 'elev'
        model = models.standard_profile(5.0, 30000.0, 6.0, wind_ds, elev_ds, warns)
        const.assert_called_with(5.0)
        wind.assert_called_with(wind_ds, warns)
        linear.assert_any_call(['const', 'wind'])
        burst.assert_called_with(30000.0)
        drag.assert_called_with(6.0)
        linear.assert_called_with(['drag', 'wind'])
        elev.assert_called_with(elev_ds)
        assert_equal(model, (('linear', 'burst'), ('linear', 'elev')))
        assert not warns.any

    @patch('tawhiri.models.make_linear_model')
    @patch('tawhiri.models.make_constant_ascent')
    @patch('tawhiri.models.make_wind_velocity')
    @patch('tawhiri.models.make_burst_termination')
    @patch('tawhiri.models.make_time_termination')
    def test_float_profile(self, time, burst, wind, const, linear):
        warns = warnings.WarningCounts()
        wind_ds = Mock()
        time.return_value = 'time'
        burst.return_value = 'burst'
        wind.return_value = 'wind'
        const.return_value = 'const'
        linear.return_value = 'linear'
        model = models.float_profile(5.0, 12000.0, 7200.0, wind_ds, warns)
        const.assert_called_with(5.0)
        wind.assert_called_with(wind_ds, warns)
        linear.assert_called_with(['const', 'wind'])
        burst.assert_called_with(12000.0)
        time.assert_called_with(7200.0)
        assert_equal(model, (('linear', 'burst'), ('wind', 'time')))
        assert not warns.any
