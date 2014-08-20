API
===

Tawhiri provides a simple API for requesting predictions. The current API
version is `Version 1`_.

.. _Ruaumoko: http://www.cusf.co.uk/wiki/Ruaumoko

Version 1
---------

API Endpoint
~~~~~~~~~~~~~
There is a single endpoint, http://predict.cusf.co.uk/api/v1/, to which ``GET``
requests must be made with request parameters in the query string.

Profiles
~~~~~~~~
Tawhiri supports multiple flight profiles which contain a description of the
model chain to be used when predicting a specific flight type.

Tawhiri currently supports the following profiles:
 * Standard Profile - ``standard_profile``
 * Float Profile - ``float_profile``

Standard Profile
^^^^^^^^^^^^^^^^
A profile for the standard high altitude balloon situation of ascent at a
constant rate followed by burst and subsequent descent at terminal velocity
under parachute with a predetermined sea level descent rate.

The API refers to this profile as ``standard_profile``.

Float Profile
^^^^^^^^^^^^^
A profile for the typical floating balloon situation of ascent at constant
altitude to a float altitude which persists for some amount of time before
stopping. Descent is not predicted when using this profile.

The API refers to this profile as ``float_profile``.

Requests
~~~~~~~~
The following parameters are accepted for all requests to the predictor API. In
addition, each profile accepts various additional parameters.

.. list-table::
   :header-rows: 1

   * - Parameter
     - Required
     - Default Value
     - Description
   * - ``profile``
     - optional
     - ``standard_profile``
     - The profile to use for this prediction.
   * - ``dataset``
     - optional
     - The latest dataset.
     - The dataset to use for this prediction formatted as a RFC3339 timestamp.
   * - ``launch_latitude``
     - required
     - 
     - Launch latitude in decimal degrees. Must be between ``-90.0`` and
       ``90.0``.
   * - ``launch_longitude``
     - required
     - 
     - Launch longitude in decimal degrees. Must be between ``0.0`` and
       ``360.0``.
   * - ``launch_datetime``
     - required
     - 
     - Time and date of launch formatted as a RFC3339 timestamp.
   * - ``launch_altitude``
     - optional
     - Defaults to elevation at launch location looked up using Ruaumoko_.
     - Elevation of launch location in metres above sea level.

Standard Profile
^^^^^^^^^^^^^^^^
The standard profile accepts the following parameters in addition to the
general parameters above.

.. list-table::
   :header-rows: 1

   * - Parameter
     - Required
     - Default Value
     - Description
   * - ``ascent_rate``
     - required
     - 
     - The ascent rate of the balloon in metres per second. Must be greater
       than ``0.0``.
   * - ``burst_altitude``
     - required
     - 
     - The burst altitude of the balloon in metres above sea level. Must be
       greater than the launch altitude.
   * - ``descent_rate``
     - required
     - 
     - The descent rate of the balloon in metres per second. Must be greater
       than ``0.0``.

Float Profile
^^^^^^^^^^^^^
The float profile accepts the following parameters in addition to the
general parameters above.

.. list-table::
   :header-rows: 1

   * - Parameter
     - Required
     - Default Value
     - Description
   * - ``ascent_rate``
     - required
     - 
     - The ascent rate of the balloon in metres per second. Must be greater
       than ``0.0``.
   * - ``float_altitude``
     - required
     - 
     - The float altitude of the balloon in metres above sea level. Must be
       greater than the launch altitude.
   * - ``stop_datetime``
     - required
     - 
     - Time and date to stop the float prediction formatted as a RFC3339
       timestamp. Must be after the launch datetime.

Responses
~~~~~~~~~
Responses are returned in JSON and consist of various fragments. Successful
responses contain ``request``, ``prediction`` and ``metadata`` fragments.
Error responses contain ``error`` and ``metadata`` fragments only.

The predictor API returns HTTP Status Code ``200 OK`` for all successful
predictions.

Request Fragment
^^^^^^^^^^^^^^^^
The request fragment contains a copy of the request with any optional
parameters filled in. If the latest dataset is being used, its timestamp is
included. The API version is also included.

Example:

.. code-block:: json

   "request": {
     "ascent_rate": 5.0,
     "burst_altitude": 30000.0,
     "dataset": "2014-08-19T12:00:00Z",
     "descent_rate": 10.0,
     "launch_altitude": 0,
     "launch_datetime": "2014-08-19T23:00:00Z",
     "launch_latitude": 50.0,
     "launch_longitude": 0.01,
     "profile": "standard_profile",
     "version": 1
   }

Prediction Fragment
^^^^^^^^^^^^^^^^^^^
The prediction fragment consists of a list of stages according to the profile
in use. Each stage has a name and a trajectory. The trajectory is a list of
points. A point consists of a ``latitude`` (decimal degrees), a ``longitude``
(decimal degrees), an ``altitude`` (metres above sea level) and a ``datetime``
(RFC3339 timestamp).

.. list-table::
   :header-rows: 1

   * - Profile
     - Stages
   * - ``standard_profile``
     - ``ascent``, ``descent``
   * - ``float_profile``
     - ``ascent``, ``float``

Example (truncated for brevity):

.. code-block:: json

   "prediction": [
     {
       "stage": "ascent",
       "trajectory": [
         {
           "altitude": 0.0,
           "datetime": "2014-08-19T23:00:00Z",
           "latitude": 50.0,
           "longitude": 0.01
         },
         {
           "altitude": 29997.65625,
           "datetime": "2014-08-20T00:39:59.53125Z",
           "latitude": 50.016585320900354,
           "longitude": 1.0037172612852707
         }
       ]
     },
     {
       "stage": "descent",
       "trajectory": [
         {
           "altitude": 29997.65625,
           "datetime": "2014-08-20T00:39:59.53125Z",
           "latitude": 50.016585320900354,
           "longitude": 1.0037172612852707
         },
         {
           "altitude": 69.78466142247058,
           "datetime": "2014-08-20T01:02:50.625Z",
           "latitude": 50.01827279347765,
           "longitude": 1.2934223933861644
         }
       ]
     }
   ]

Metadata Fragment
^^^^^^^^^^^^^^^^^
The ``metadata`` fragment contains ``start_datetime`` and ``complete_datetime``
which are RFC3339 formatted timestamps representing the time and date when the
prediction was started and completed.

Example:

.. code-block:: json

   "metadata": {
     "complete_datetime": "2014-08-19T21:32:52.036925Z",
     "start_datetime": "2014-08-19T21:32:51.929028Z"
   }

Error Fragment
^^^^^^^^^^^^^^
The API currently outputs the following types of errors in the error fragment:

.. list-table::
   :header-rows: 1

   * - Type
     - HTTP Status Code
     - Description
   * - ``RequestException``
     - ``400 Bad Request``
     - Returned if the request is invalid.
   * - ``InvalidDatasetException``
     - ``404 Not Found``
     - Returned if the requested dataset is invalid.
   * - ``PredictionException``
     - ``500 Internal Server Error``
     - Returned if the predictor's solver raises an exception.
   * - ``InternalException``
     - ``500 Internal Server Error``
     - Returned when an internal error occurs.
   * - ``NotYetImplementedException``
     - ``501 Not Implemented``
     - Returned when the functionality requested has not yet been implemented.

Example:

.. code-block:: json

   "error": {
     "description": "Parameter 'launch_datetime' not provided in request.",
     "type": "RequestException"
   }

Full Examples
~~~~~~~~~~~~~

Successful Standard Prediction
^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
Request:

.. code-block:: bash

   $ curl "http://predict.cusf.co.uk/api/v1/?launch_latitude=50.0&launch_longitude=0.01&launch_datetime=2014-08-20T00%3A00%3A00%2B01:00&ascent_rate=5&burst_altitude=30000&descent_rate=10"

Response (prediction truncated for brevity):

.. code-block:: json

   {
     "metadata": {
       "complete_datetime": "2014-08-19T21:32:52.036925Z",
       "start_datetime": "2014-08-19T21:32:51.929028Z"
     },
     "prediction": [
       {
         "stage": "ascent",
         "trajectory": [
           {
             "altitude": 0.0,
             "datetime": "2014-08-19T23:00:00Z",
             "latitude": 50.0,
             "longitude": 0.01
           },
           {
             "altitude": 29997.65625,
             "datetime": "2014-08-20T00:39:59.53125Z",
             "latitude": 50.016585320900354,
             "longitude": 1.0037172612852707
           }
         ]
       },
       {
         "stage": "descent",
         "trajectory": [
           {
             "altitude": 29997.65625,
             "datetime": "2014-08-20T00:39:59.53125Z",
             "latitude": 50.016585320900354,
             "longitude": 1.0037172612852707
           },
           {
             "altitude": 69.78466142247058,
             "datetime": "2014-08-20T01:02:50.625Z",
             "latitude": 50.01827279347765,
             "longitude": 1.2934223933861644
           }
         ]
       }
     ],
     "request": {
       "ascent_rate": 5.0,
       "burst_altitude": 30000.0,
       "dataset": "2014-08-19T12:00:00Z",
       "descent_rate": 10.0,
       "launch_altitude": 0,
       "launch_datetime": "2014-08-19T23:00:00Z",
       "launch_latitude": 50.0,
       "launch_longitude": 0.01,
       "profile": "standard_profile",
       "version": 1
     }
   }

Missing Parameters
^^^^^^^^^^^^^^^^^^
Request:

.. code-block:: bash

   $ curl "http://predict.cusf.co.uk/api/v1/?launch_latitude=50.0&launch_longitude=0.01"

Response:

.. code-block:: json

   {
     "error": {
       "description": "Parameter 'launch_datetime' not provided in request.",
       "type": "RequestException"
     },
     "metadata": {
       "complete_datetime": "2014-08-19T21:40:08.697297Z",
       "start_datetime": "2014-08-19T21:40:08.697059Z"
     }
   }
