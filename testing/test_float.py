import sys
from os.path import abspath, split, join
sys.path.append(join(split(abspath(__file__))[0], '..'))

import time
import itertools
from datetime import datetime
import json
import calendar

from tawhiri import solver, models, kml
from tawhiri.dataset import Dataset as WindDataset
from ruaumoko import Dataset as ElevationDataset

lat0 = 52.5563
lng0 = 360 - 3.1970
alt0 = 0.0
t0 = calendar.timegm(datetime(2014, 2, 19, 15).timetuple())
tE = calendar.timegm(datetime(2014, 2, 20, 6, 1).timetuple())

wind = WindDataset.open_latest()
stages = models.float_profile(2.0, 10000, tE, wind)

rise, float = solver.solve(t0, lat0, lng0, alt0, stages)

assert rise[-1] == float[0]

with open("test_prediction_data.js", "w") as f:
    f.write("var data = ")
    json.dump([(lat, lon) for _, lat, lon, _ in rise + float], f, indent=4)
    f.write(";\n")

markers = [
    {'name': 'launch', 'description': 'TODO', 'point': rise[0]},
    {'name': 'reached float', 'description': 'TODO', 'point': float[0]}
]

kml.kml([rise, float], markers, 'test_prediction.kml')
