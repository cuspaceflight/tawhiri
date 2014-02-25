import time
from tawhiri import wind, solver, models

ds = wind.Dataset("/home/adam/Projects/tawhiri/datasets", 2014, 2, 3, 6)

f = models.make_f([models.make_constant_ascent(5.0), models.wind_velocity], ds)
term = models.make_burst_termination(30000.0)


t0 = 6.0 * 3600
lat0 = 52.0
lng0 = 0.0
alt0 = 0.0

dt = 1.0

n_repeats = 100

start_time = time.time()
for i in range(n_repeats):
    result = solver.euler(t0, lat0, lng0, alt0, f, term, dt)
end_time = time.time()

#for idx, t in enumerate(ts):
    #print(t, lats[idx], lngs[idx], alts[idx])

print("Averaged {:.1f}ms per prediction".format(
    ((end_time - start_time)/n_repeats)*1000.0))
