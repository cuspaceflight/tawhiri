Design of the predictor
=======================

.. highlight:: python

Overview
--------

The basic idea is to do something along the lines of::

    while not k(time, lat, lon, alt):
        lat_dot, lon_dot, alt_dot = f(time, lat, lon, alt):
        lat += lat_dot * dt
        lon += lon_dot * dt
        alt += alt_dot * dt

where

  - `f` is a **model** (or a combination of, see below),
  - `k` is a **termination function**.

Purity
~~~~~~

Models, altitude profiles and termination functions must all be `pure <http://en.wikipedia.org/wiki/Pure_function>`_.

Besides being cleaner, it allows us to use more interesting integration methods without worrying about side effects evaluating the functions.

Coordinates
~~~~~~~~~~~

We principally deal with position represented as latitude, longitude and metres above sea level. While we do have to consider horizontal velocities in metres per second (e.g., when consulting wind data), we convert to latitude & longitude (or rather, “change in latitude per unit time”) as soon as possible since they will (probably) be simpler to work with. (“ASAP” is so that we—as much as possible—are only working in one coordinate system throughout the code.)

Time is represented as an absolute UNIX timestamp.

Models
------

A model is a callable that looks something like this::

    def f(time, lat, lon, alt):
        # < calculation goes here >
        return lat_dot, lon_dot, alt_dot

.. function:: f(time, lat, lon, alt):

    Return velocities predicted by this model (example function)

    The latitude and longitude “velocities” (`lat_dot` & `lon_dot`)
    are “change in decimal degrees per unit time”;
    vertical velocity (`alt_dot`) is just metres per second.

    :type time: float
    :param time: current absolute time, unix timestamp
    :type lat: float
    :param lat: current latitude, decimal degrees
    :type lon: float
    :param lon: current longitude, decimal degrees
    :type alt: float
    :param alt: current altitude, metres above sea level
    :rtype: 3-tuple of floats: ``(lat_dot, lon_dot, alt_dot)``

…configuration
~~~~~~~~~~~~~~

…is specified via closures, i.e. we have a function that takes some configuration and returns the actual model function.

…linear combinations thereof
~~~~~~~~~~~~~~~~~~~~~~~~~~~~

We want to be able to specify several models, and then “swap bits” out, or pick from a selection when setting up a flight. E.g., we might want to choose a combination of

* wind velocity
* constant ascent
* something more exotic, say, parachute glide

For the majority of cases, a linear combination of the models we are interested in will suffice. Note that a function that linearly combines models is itself a model; see :meth:`tawhiri.models.make_linear_model`.

Termination functions
---------------------

A termination condition decides if the prediction (stage) should stop. They are functions that look something like::

    def k(time, lat, lon, alt):
        return alt >= 30000

Note that a function returns ``True`` to indicate that the prediction should stop.

.. function:: k(time, lat, lon, alt):

    Decides if the prediction should stop (an example function)

    Returns ``True`` if the prediction should terminate.

    :type time: float
    :param time: current absolute time, unix timestamp
    :type lat: float
    :param lat: current latitude, decimal degrees
    :type lon: float
    :param lon: current longitude, decimal degrees
    :type alt: float
    :param alt: current altitude, metres above sea level
    :rtype: bool

…combinations thereof
~~~~~~~~~~~~~~~~~~~~~

Similarly to the ability to linearly combine models, we can “OR” termination functions together with :meth:`tawhiri.models.make_any_terminator`.

Chaining
--------

We want to chain stages of a prediction together: this essentially amounts to running several predictions, with the initial conditions of the next prediction being the final position of the last, and concatenating the results (see :meth:`tawhiri.solver.solve`).

:mod:`tawhiri.models` contains a few “pre-defined profiles”, that is, functions that take some configuration and produce a chain of stages for a common scenario.

As an example, :meth:`tawhiri.models.standard_profile` produces the chain containing two stages:

* stage 1

  * model: a linear combination (:meth:`tawhiri.models.make_linear_model`) of constant ascent (:meth:`tawhiri.models.make_constant_ascent`) and wind velocity :meth:`tawhiri.models.make_wind_velocity`)
  * termination condition: above-a-certain-altitude (:meth:`tawhiri.models.make_burst_termination`)

* stage 2

  * model: a linear combination of “drag descent” (:meth:`tawhiri.models.make_drag_descent`) and wind velocity
  * termination condition: positive altitude (:meth:`tawhiri.models.ground_termination`)
