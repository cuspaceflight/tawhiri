import math


_PI_180 = math.pi / 180.0
_180_PI = 180.0 / math.pi

def make_constant_ascent(ascent_rate):
    def constant_ascent(t, lat, lng, alt, dataset):
        return 0.0, 0.0, ascent_rate
    return constant_ascent

def make_drag_descent(sea_level_descent_rate):
    def density(alt):
        temp = pressure = 0.0
        if alt > 25000:
            temp = -131.21 + 0.00299 * alt
            pressure = 2.488 * ((temp + 273.1)/(216.6)) ** (-11.388)
        elif 11000 < alt <= 25000:
            temp = -56.46
            pressure = 22.65 * math.exp(1.73 - 0.000157 * alt)
        else:
            temp = 15.04 - 0.00649 * alt
            pressure = 101.29 * ((temp + 273.1)/288.08) ** (5.256)
        return pressure / (0.2869*(temp + 273.1))

    drag_coefficient = sea_level_descent_rate * 1.1045

    def drag_descent(t, lat, lng, alt, dataset):
        return 0.0, 0.0, -drag_coefficient/math.sqrt(density(alt))
    return drag_descent

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

def ground_termination(t, lat, lng, alt):
    if alt <= 0:
        return True

def make_f(models, dataset):
    def f(t, lat, lng, alt):
        chunks = [model(t, lat, lng, alt, dataset) for model in models]
        return [sum((chunk[i] for chunk in chunks)) for i in range(3)]
    return f

def make_any_terminator(terminators):
    def terminator(t, lat, lng, alt):
        return any(term(t, lat, lng, alt) for term in terminators)
    return terminator
