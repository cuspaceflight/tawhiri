import sys
import time
from datetime import datetime, timedelta
import json

from tawhiri import dataset, solver, models

if len(sys.argv) != 2:
    print("Usage: {} <path to datasets>".format(sys.argv[0]))
    sys.exit(1)

lat0 = 52.0
lng0 = 0.0
alt0 = 0.0

dt = 1.0

n_repeats = 100

ds = dataset.Dataset.open_latest(sys.argv[1])
t0 = ds.ds_time + timedelta(hours=12)
stages = models.make_standard_stages(5.0, 30000, 5.0, ds)
result = solver.solve(t0, lat0, lng0, alt0, stages)

with open("test_prediction_data.js", "w") as f:
    f.write("var data = ")
    json.dump([(lat, lon) for _, lat, lon, _ in result], f, indent=4)
    f.write(";\n")
