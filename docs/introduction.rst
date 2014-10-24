Introduction
============

The project is separated into three parts:

* the predictor: provides an API over which requests for a prediction can be made. This API is public, and can be used by main predictor web UI, as a live predictor by mapping software, and potential future uses we haven't thought of.
* the web UI
* the dataset downloader: runs as a single standalone separate process, watches for new datasets published by the NOAA and retrieves them.

Setup & Installation
--------------------

Predictor
~~~~~~~~~

…is written for Python 3 (though is compatible with Python 2) and needs Cython:

.. code:: bash

    $ virtualenv venv
    $ source venv/bin/activate
    $ pip install cython
    $ python setup.py build_ext --inplace

The last line (re-)builds the Cython extensions, and needs to be run again after modifying any `.pyx` files.

Downloader
~~~~~~~~~~

The downloader uses gevent, so we are (disappointingly) restricted to running it under Python 2 for now.

At the time of writing, pygrib head did not work (in contrast to an earlier version), and both have a broken `setup.py`. Therefore, we need to install numpy first, and pyproj separately:

.. code:: bash

    $ sudo aptitude install libevent-dev libgrib-api-dev
    $ virtualenv -p python2 venv
    $ source venv/bin/activate
    $ pip install numpy
    $ pip install pygrib==1.9.6 pyproj 'gevent<1.0'

Web API
~~~~~~~

The web API may be run in a development web-server using the ``tawhiri-webapp``
script. If necessary, you can use the ``TAWHIRI_SETTINGS`` environment variable
to load configuration from a file:

.. code:: bash

    $ cat > devel-settings.txt <<EOL
    ELEVATION_DATASET = '/path/to/ruaumoko-dataset'
    WIND_DATASET_DIR = '/path/to/tawhiri-datasets'
    EOL
    $ tawhiri-webapp runserver -rd

See the output of ``tawhiri-webapp -?`` and ``tawhiri-webapp runserver -?`` for
more information.

