import sys
import time
from datetime import datetime
import json

from tawhiri import solver, models, kml
from tawhiri.dataset import Dataset as WindDataset
from ruaumoko import Dataset as ElevationDataset

lat0 = 52.5563
lng0 = 360 - 3.1970
alt0 = 0.0
t0 = datetime(2014, 2, 19, 15)

wind = WindDataset.open_latest("/opt/wind32")
elevation = ElevationDataset("/opt/elevation")

stages = models.standard_profile(5.0, 30000, 5.0, wind, elevation)
result = solver.solve(t0, lat0, lng0, alt0, stages)

with open("test_prediction_data.js", "w") as f:
    f.write("var data = ")
    json.dump([(lat, lon) for _, lat, lon, _ in result], f, indent=4)
    f.write(";\n")

markers = [
    {'name': 'launch', 'description': 'TODO', 'point': result[0]},
    {'name': 'landing', 'description': 'TODO', 'point': result[-1]},
    # TODO: add burst after solver returns points where models change
]

kml.kml(result, markers, 'test_prediction.kml')
