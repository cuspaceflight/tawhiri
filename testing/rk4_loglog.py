import matplotlib
matplotlib.use('Agg')

import numpy as np
import matplotlib.pyplot as plt

from tawhiri.solver import rk4


def f(t, lat, lng, alt):
    return t * lat, t * lng, np.sin(t) ** 2

def tc(t, lat, lng, alt):
    return t >= np.pi / 2 - 0.000001

expx22 = np.exp(np.pi ** 2 / 8)
expect = np.array([expx22, expx22, np.pi / 4])

def test(dt):
    result = rk4(0, 1, 1, 0, f, tc, dt)
    last = np.array(result[-1][1:])
    print(dt, len(result), *(expect - last))
    return expect - last

steps = np.cast[int](10 ** np.linspace(0, 4, 20))
dts = np.pi / (2 * steps)
errors = np.array([test(dt) for dt in dts])
errors = np.abs(errors)

plt.loglog(dts, errors[:,1])
plt.loglog(dts, dts[:,np.newaxis] ** np.array([1, 2, 3, 4]))
plt.savefig('loglog.png')
