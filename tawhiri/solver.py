def euler(t, lat, lng, alt, f, terminators, dt):
    result = [(t, lat, lng, alt)]
    while not any(terminator(t, lat, lng, alt) for terminator in terminators):
        t += dt
        df = f(t, lat, lng, alt)
        lat += df[0] * dt
        lng += df[1] * dt
        alt += df[2] * dt
        result.append((t, lat, lng, alt))

    return result
