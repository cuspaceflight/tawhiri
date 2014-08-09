import sys
import time
from datetime import timedelta

from tawhiri import solver, models
from tawhiri.dataset import Dataset as WindDataset
from ruaumoko import Dataset as ElevationDataset

wind = WindDataset.open_latest("/opt/wind32")
elevation = ElevationDataset("/opt/elevation")

lat0 = 52.0
lng0 = 0.0
alt0 = 0.0
t0 = wind.ds_time + timedelta(hours=12)

stages = models.standard_profile(5.0, 30000, 5.0, wind, elevation)

n_repeats = 100

start_time = time.time()
for i in range(n_repeats):
    result = solver.solve(t0, lat0, lng0, alt0, stages)
end_time = time.time()

print("Averaged {:.1f}ms per prediction".format(
    ((end_time - start_time)/n_repeats)*1000.0))
