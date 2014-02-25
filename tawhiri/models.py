import math


_PI_180 = math.pi / 180.0
_180_PI = 180.0 / math.pi

def make_constant_ascent(ascent_rate):
    def constant_ascent(t, lat, lng, alt, dataset):
        return 0.0, 0.0, ascent_rate
    return constant_ascent


def wind_velocity(t, lat, lng, alt, dataset):
    u, v = dataset.get_wind(t / 3600.0, alt, lat, lng)
    R = 6371009 + alt
    dlat = _180_PI * v / R
    dlng = _180_PI * u / (R * math.cos(lat * _PI_180))
    return dlat, dlng, 0.0


def make_burst_termination(burst_altitude):
    def burst_termination(t, lat, lng, alt):
        if alt >= burst_altitude:
            return True
    return burst_termination


def make_f(models, dataset):
    def f(t, lat, lng, alt):
        chunks = [model(t, lat, lng, alt, dataset) for model in models]
        return [sum((chunk[i] for chunk in chunks)) for i in range(3)]
