# T&#257;whirim&#257;tea

## Introduction

Tawhiri is the name given to the next version of the CUSF Landing Prediction
Software, which will probably be different enough from the current version
(see below) to warrant a new name.

The name comes from a
[M&#257;ori](http://en.wikipedia.org/wiki/M%C4%81ori_people)
god of weather, which rather aptly
&ldquo;drove Tangaroa and his progeny into the sea &rdquo;
[(WP)](http://en.wikipedia.org/wiki/Tawhiri).

## More information

Please see the [CUSF wiki](http://www.cusf.co.uk/wiki/), which contains pages
on [Tawhiri](http://www.cusf.co.uk/wiki/tawhiri:start) and [prediction in
general](http://www.cusf.co.uk/wiki/landing_predictor).

## Setup

pygrib (at the time of writing) had a broken setup.py, so we need to install
numpy first, and pyproj separately.

```bash
$ sudo aptitude install libevent-dev libgrib-api-dev
$ virtualenv venv
$ source venv/bin/activate
$ pip install numpy
$ pip install pygrib pyproj 'gevent<1.0'
```


