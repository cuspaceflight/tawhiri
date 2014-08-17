# Copyright 2014 (C) Priyesh Patel
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

"""
Provide the HTTP API for Tawhiri.
"""

from flask import Flask, jsonify, request
from datetime import datetime
import strict_rfc3339
import calendar

from tawhiri import solver, models
from tawhiri.dataset import Dataset as WindDataset
from ruaumoko import Dataset as ElevationDataset

app = Flask(__name__)

ruaumoko_ds = ElevationDataset()

"""
Util functions
"""
def _rfc3339_to_datetime(dt):
    return datetime.fromtimestamp(strict_rfc3339.rfc3339_to_timestamp(dt))

def _datetime_to_rfc3339(dt):
    return strict_rfc3339.timestamp_to_rfc3339_utcoffset(calendar.timegm(dt.timetuple()))

def _bulk_convert_datetime_to_rfc3339(data):
    for key in data:
        if isinstance(data[key], datetime):
            data[key] = _datetime_to_rfc3339(data[key])
    return data

"""
Exceptions
"""
class APIException(Exception):
    status_code = 500

class APIVersionException(APIException):
    status_code = 400

class RequestException(APIException):
    status_code = 400

class InvalidDatasetException(APIException):
    status_code = 400

class InternalException(APIException):
    status_code = 500

class NotYetImplementedException(APIException):
    status_code = 501

"""
Request
"""
def parse_request(data):
    """
    Parse the POST request.
    """
    req = {}

    # API version
    req['version'] = _extract_parameter(data, "version", int)
    if req['version'] != 1:
        raise APIVersionException("Unknown or unsupported API version.")

    # Generic fields
    for field in ["launch_latitude", "launch_longitude", "ascent_rate"]:
        req[field] = _extract_parameter(data, field, float)
    req['launch_altitude'] = _extract_parameter(data, "launch_altitude", float,
            ignore=True)
    req['launch_datetime'] = _extract_parameter(data, "launch_datetime",
            _rfc3339_to_datetime)

    # Prediction profile
    req['profile'] = _extract_parameter(data, "profile", str,
            "standard_profile")

    if req['profile'] == "standard_profile":
        for field in ["ascent_rate", "burst_altitude", "descent_rate"]:
            req[field] = _extract_parameter(data, field, float)
    elif req['profile'] == "float_profile":
        for field in ["ascent_rate", "float_altitude"]:
            req[field] = _extract_parameter(data, field, float)

        req['stop_time'] = _extract_parameter(data, "stop_time",
                _rfc3339_to_datetime)
    else:
        raise RequestException("Unknown profile '%s'." % req['profile'])

    # Dataset
    req['dataset'] = _extract_parameter(data, "dataset", _rfc3339_to_datetime,
            "latest")

    return req

def _extract_parameter(data, parameter, cast, default=None, ignore=False):
    """
    Extract a parameter from the POST request and raise an exception if any
    parameter is missing or invalid.
    """
    if parameter not in data:
        if default is None and not ignore:
            raise RequestException("Parameter '%s' not provided in request." %
                    parameter)
        return default

    try:
        return cast(data[parameter])
    except Exception:
        raise RequestException("Unable to parse parameter '%s': %s." %
                (parameter, data[parameter]))

"""
Response
"""
def run_prediction(req):
    """
    Run the prediction.
    """
    # If no launch altitude provided, use Ruaumoko to look it up
    if req['launch_altitude'] is None:
        req['launch_altitude'] = ruaumoko_ds.get(req['launch_latitude'],
                req['launch_longitude'])

    # Response dict
    resp = {
        "request": req,
        "prediction": [],
        "metadata": {},
    }

    # Start time
    resp['metadata']['start_time'] = _datetime_to_rfc3339(datetime.now())

    # Dataset
    if req['dataset'] == "latest":
        tawhiri_ds = WindDataset.open_latest()
    else:
        try:
            tawhiri_ds = WindDataset(req['dataset'])
        except IOError:
            raise InvalidDatasetException("No dataset found for '%s'." %
                    _datetime_to_rfc3339(req['dataset']))

    resp['request']['dataset'] = tawhiri_ds.ds_time

    # Stages
    if req['profile'] == "standard_profile":
        stages = models.standard_profile(req['ascent_rate'],
                req['burst_altitude'], req['descent_rate'], tawhiri_ds,
                ruaumoko_ds)
    elif req['profile'] == "float_profile":
        stages = models.float_profile(req['ascent_rate'],
                req['float_altitude'], req['stop_time'], tawhiri_ds)
    else:
        raise InternalException("No implementation for known profile.")

    # Run solver
    result = solver.solve(req['launch_datetime'], req['launch_latitude'],
            req['launch_longitude'], req['launch_altitude'], stages)

    # Format trajectory
    if req['profile'] == "standard_profile":
        resp['prediction'] = _parse_stages(["ascent", "descent"], result)
    elif req['profile'] == "float_profile":
        resp['prediction'] = _parse_stages(["ascent", "float"], result)
    else:
        raise InternalException("No implementation for known profile.")

    # Convert request datetimes
    resp['request'] = _bulk_convert_datetime_to_rfc3339(resp['request'])

    # End time
    resp['metadata']['complete_time'] = _datetime_to_rfc3339(datetime.now())

    return resp

def _parse_stages(labels, data):
    """
    Parse the predictor output for a set of stages.
    """
    assert len(labels) == len(data)

    prediction = []
    for index, leg in enumerate(data):
        stage = {}
        stage['stage'] = labels[index]
        stage['trajectory'] = [{
            'latitude': lat,
            'longitude': lon,
            'altitude': alt,
            'datetime': strict_rfc3339.timestamp_to_rfc3339_utcoffset(dt),
            } for dt, lat, lon, alt in leg]
        prediction.append(stage)
    return prediction

"""
Flask App
"""
@app.route('/', methods=['POST'])
def main():
    """
    Single API endpoint which accepts POST requests.
    """
    return jsonify(run_prediction(parse_request(request.form)))

@app.errorhandler(APIException)
def handle_exception(error):
    resp = {}
    resp['error'] = {
        "type": type(error).__name__,
        "description": str(error)
    }
    return jsonify(resp), error.status_code
