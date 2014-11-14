from flask.ext.testing import TestCase

from tawhiri.api import app

# Root path for v1 API
API_ROOT = '/api/v1/'

class BasicApiTest(TestCase):
    def create_app(self):
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

