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

  - The [CUSF wiki](http://www.cusf.co.uk/wiki/) contains some pages on 
    [Tawhiri](http://www.cusf.co.uk/wiki/tawhiri:start) and
    [prediction in general](http://www.cusf.co.uk/wiki/landing_predictor).

  - Some [notes](http://www.danielrichman.co.uk/files/tawhiri-notes/)
    made during the meetings so far
    ([gh](https://github.com/danielrichman/tawhiri-notes))

## Dependencies

As much of the project as possible is written for Python 3. The only exception
(so far) is the wind data downloading code, since there is not yet an official
gevent port to Python 3.

pygrib (at the time of writing) had a broken setup.py, so we need to install
numpy first, and pyproj separately.

```bash
$ sudo aptitude install libevent-dev libgrib-api-dev
$ virtualenv venv2.7
$ source venv2.7/bin/activate
$ pip install numpy
$ pip install pygrib pyproj 'gevent<1.0'
```

## License & Authors

Tawhiri was written by various CUSF members (see [AUTHORS](AUTHORS.md)) and is
licensed under the GNU GPL v3 (see [COPYING](COPYING)).
