from array import array

def euler(t, lat, lng, alt, dataset, f, models, terminators, dt):
    ts = array('d', (t,))
    lats = array('d', (lat,))
    lngs = array('d', (lng,))
    alts = array('d', (alt,))
    while not any(terminator(t, lat, lng, alt) for terminator in terminators):
        t += dt
        df = f(t, lat, lng, alt, dataset, models)
        lat += df[0] * dt
        lng += df[1] * dt
        alt += df[2] * dt
        ts.append(t)
        lats.append(lat)
        lngs.append(lng)
        alts.append(alt)

    return ts, lats, lngs, alts
