import sys
from os.path import abspath, split, join
sys.path.append(join(split(abspath(__file__))[0], '..'))

import time
from datetime import timedelta
import calendar

from tawhiri import solver, models
from tawhiri.dataset import Dataset as WindDataset
from ruaumoko import Dataset as ElevationDataset

elevation = ElevationDataset()

lat0 = 52.0
lng0 = 0.0
alt0 = 0.0

n_repeats = 100

start_time = time.time()
for i in range(n_repeats):
    wind = WindDataset.open_latest(persistent=True)
    t0 = wind.ds_time + timedelta(hours=12)
    t0 = calendar.timegm(t0.timetuple())
    stages = models.standard_profile(5.0, 30000, 5.0, wind, elevation)
    result = solver.solve(t0, lat0, lng0, alt0, stages)
end_time = time.time()

print("Averaged {:.1f}ms per prediction".format(
    ((end_time - start_time)/n_repeats)*1000.0))
