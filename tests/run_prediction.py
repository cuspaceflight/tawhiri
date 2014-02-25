import time
from tawhiri import wind, solver, models

ds = wind.Dataset("/home/adam/Projects/tawhiri/datasets", 2014, 2, 3, 6)

model1 = models.make_f(
    [models.make_constant_ascent(5.0), models.wind_velocity], ds)
term1 = models.make_burst_termination(30000.0)

model2 = models.make_f(
    [models.make_drag_descent(5.0), models.wind_velocity], ds)
term2 = models.ground_termination

t0 = 6.0 * 3600
lat0 = 52.0
lng0 = 0.0
alt0 = 0.0

dt = 1.0

n_repeats = 100

start_time = time.time()
for i in range(n_repeats):
    result = solver.solve(t0, lat0, lng0, alt0,
                          [model1, model2], [term1, term2], dt)
end_time = time.time()

#for idx, t in enumerate(ts):
    #print(t, lats[idx], lngs[idx], alts[idx])

print("Averaged {:.1f}ms per prediction".format(
    ((end_time - start_time)/n_repeats)*1000.0))
