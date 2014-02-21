import time
from tawhiri.wind import Dataset

d = Dataset("/home/adam/Projects/tawhiri/datasets", 2014, 2, 3, 6)
h = d.get_pressure_heights(10.0, 52.2, 0.2)

n_repeats = 100000
t0 = time.time()
for _ in range(n_repeats):
    d.get_wind(10.0, 12345.0, 52.2, 0.2, pressure_heights=h)
t1 = time.time()

print("Average {:.6f}s".format((t1 - t0) / n_repeats))
