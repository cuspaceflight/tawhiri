from __future__ import print_function

import json

from flask import Flask
from flask.ext.testing import TestCase
from mock import patch, MagicMock
from six.moves.urllib.parse import urlencode

from tawhiri.api.v1 import api

# Root path for v1 API
API_ROOT = '/api/v1/'

class BasicApiTest(TestCase):
    def create_app(self):
        app = Flask(__name__)
        app.register_blueprint(api, url_prefix=API_ROOT)
        app.debug = True
        return app

    def test_root_get(self):
        """Check that simply GET-ing the API root with no parameters results in
        a 400 response and a descriptive JSON body.

        """
        # Make request
        response = self.client.get(API_ROOT)

        # Check request is right type with a JSON body
        self.assert400(response)
        json_body = response.json
        self.assertIsNotNone(json_body)

        # Response should have an error description.
        self.assertIn('error', json_body)

    @patch('tawhiri.models.standard_profile')
    @patch('tawhiri.solver.solve')
    @patch('tawhiri.api.v1.WindDataset')
    @patch('tawhiri.api.v1.ruaumoko_ds')
    def test_simple_run(self, ruaumoko_ds_mock, wind_ds_mock, solve_mock, profile_mock):
        """Make a simple request for a landing prediction."""

        # The minimum number of parameters for a prediction is lat, long and
        # time for launch and ascent/descent rate and burst altitude for the
        # profile.
        qs = dict(
            launch_latitude=52.1, launch_longitude=0.3,
            launch_datetime='2014-08-19T23:00:00Z',
            ascent_rate=5, descent_rate=10, burst_altitude=30000,
        )

        # We need to mock various tawhiri components:

        # Mock ruaumoko's elevation API to always return 5m.
        ruaumoko_ds_mock().get = MagicMock(return_value=5)

        # Mock latest dataset's strftime
        wind_ds_mock.open_latest().ds_time.strftime = MagicMock(return_value='strftime_mock')

        # Predictions always return the same value
        mock_prediction = [
            [ [ 1, 52, 0, 0 ], [ 2, 53, 0, 100 ] ], # ascent
            [ [ 3, 54, 1, 0 ] ], # descent
        ]
        solve_mock.configure_mock(return_value=mock_prediction)

        # Make request
        response = self.client.get(API_ROOT + '?' + urlencode(qs))

        # Check that ruaumoko was asked about launch altitude.
        ruaumoko_ds_mock().get.assert_called_with(
            qs['launch_latitude'], qs['launch_longitude']
        )

        # Response should always be JSON
        self.assertIsNotNone(response.json)
        body = response.json
        print('Response body:', json.dumps(body, indent=2))

        # Check response succeeded
        self.assert200(response)

        # Check strftime mock
        self.assertEqual(body['request']['dataset'], 'strftime_mock')

        # Check legs
        for leg in body['prediction']:
            if leg['stage'] == 'ascent':
                expected = mock_prediction[0]
            elif leg['stage'] == 'descent':
                expected = mock_prediction[1]
            else:
                self.fail('Unexpected prediction stage: {0}'.format(leg['stage']))
            self.assertEqual(len(expected), len(leg['trajectory']))

            # TODO: Compare results for equality
