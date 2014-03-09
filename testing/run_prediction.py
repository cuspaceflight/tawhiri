import time
from tawhiri import wind, solver, models


t0 = 6.0 * 3600
lat0 = 52.0
lng0 = 0.0
alt0 = 0.0

dt = 1.0

n_repeats = 100

start_time = time.time()
for i in range(n_repeats):
    ds = wind.Dataset("/home/adam/Projects/tawhiri/datasets", 2014, 2, 3, 6)
    stages = models.make_standard_stages(5.0, 30000, 5.0, ds)
    result = solver.solve(t0, lat0, lng0, alt0, stages)
end_time = time.time()

print("Averaged {:.1f}ms per prediction".format(
    ((end_time - start_time)/n_repeats)*1000.0))
