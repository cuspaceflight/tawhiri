import datetime
import pydap.client
import random
import math
import numpy as np
from tawhiri.wind import Dataset

directory = "datasets"
ds_time = datetime.datetime(2013, 7, 9, 12, 0, 0)
verbose = False

dataset_a = Dataset(directory, ds_time)

url = "http://nomads.ncep.noaa.gov:9090/dods/gfs_hd/gfs_hd20130709/gfs_hd_12z"
dataset_b = pydap.client.open_url(url)


def timestamp_to_hour(timestamp):
    (fractional_day, integer_day) = math.modf(timestamp)
    ordinal_day = int(integer_day - 1)
    dt = datetime.datetime.fromordinal(ordinal_day) + \
            datetime.timedelta(days = fractional_day)
    diff = (dt - ds_time)
    assert diff.microseconds == 0
    assert diff.total_seconds() % 3600 == 0
    return (diff.total_seconds() / 3600)

variable_to_opendap = {"height": "hgtprs",
                       "wind_u": "ugrdprs", "wind_v": "vgrdprs"}

axes_test = dataset_b[variable_to_opendap["height"]]
assert axes_test.dimensions == ('time', 'lev', 'lat', 'lon')
assert [timestamp_to_hour(x) for x in axes_test.time] == Dataset.axes.hour
assert np.array_equal(axes_test.lev, Dataset.axes.pressure)
assert np.array_equal(axes_test.lat, Dataset.axes.latitude)
assert np.array_equal(axes_test.lon, Dataset.axes.longitude)

axes_b = (axes_test.time, axes_test.lev, axes_test.lat, axes_test.lon)

for i in range(20):
    # dataset_a: hour, pressure, variable, latitude, longitude
    # dataset_b: [variable][time, pressure, latitude, longitude]

    location = tuple(random.randrange(0, len(x)) for x in Dataset.axes)
    location_name = tuple(Dataset.axes[i][n] for i, n in enumerate(location))
    location_b = location[0:2] + location[3:]
    ndap_var = variable_to_opendap[location_name[2]]

    print "location", location

    if verbose:
        print "location_name", location_name

        location_b_name = (timestamp_to_hour(axes_b[0][location_b[0]]), ) + \
                           tuple(axes_b[i+1][n]
                                 for i,n in enumerate(location_b[1:]))

        print "location_b", location_b
        print "location_b_name", location_b_name, "ndap_var", ndap_var

    value_a = dataset_a.array[location]
    value_b = dataset_b[ndap_var][location_b].data[0]

    diff = abs(value_a - value_b)
    mag = abs(max(value_a, value_b))
    rdiff = diff / mag
    ok = rdiff < 1e-7

    print "a", value_a, "b", value_b, rdiff, ok

    if not ok:
        break
