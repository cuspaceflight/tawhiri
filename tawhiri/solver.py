def solve(t, lat, lng, alt, fs, terms, dt):
    results = [(t, lat, lng, alt)]
    for f, term in zip(fs, terms):
        results += euler(t, lat, lng, alt, f, term, dt)
        t, lat, lng, alt = results[-1]
    return results

def euler(t, lat, lng, alt, f, terminator, dt):
    result = []
    while not terminator(t, lat, lng, alt):
        t += dt
        df = f(t, lat, lng, alt)
        lat += df[0] * dt
        lng += df[1] * dt
        alt += df[2] * dt
        result.append((t, lat, lng, alt))
    return result
