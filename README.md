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

### Predictor

…is written for Python 3 (it uses memoryviews; Issue #19), and needs Cython:

```bash
$ virtualenv-3.3 venv3
$ source venv3/bin/activate
$ pip install cython
$ python setup.py build_ext --inplace
```

The last line (re-)builds the Cython extensions, and needs to be run again
after modifying any `.pyx` files.

#### Memory overcommit

Until issue #17 is resolved, we are forced to open the dataset read-only
and mmap it privately.
Turns out the kernel is a bit unhappy about us asking for 18G of memory we
might end up using. The ~~“solution”~~hack is to turn overcommit up to
infinity:

```bash
sudo sysctl vm.overcommit_memory=1
```

…and create `/etc/sysctl.d/90-tawhiri-overcommit.conf` with contents:

```
vm.overcommit_memory=1
```

### Downloader

The downloader uses gevent, so we are disappointingly restricted to running
it under Python 2 for now (Issue #18).

At the time of writing, pygrib head did not work (in contrast to an earlier
version; see Issue #15), and both have a broken `setup.py`. Therefore, we
need to install numpy first, and pyproj separately:

```bash
$ sudo aptitude install libevent-dev libgrib-api-dev
$ virtualenv-2.7 venv2
$ source venv2/bin/activate
$ pip install numpy
$ pip install pygrib==1.9.6 pyproj 'gevent<1.0'
```
