tawhiri package
===============

Submodules
----------

tawhiri.dataset module
----------------------

.. automodule:: tawhiri.dataset
    :members:
    :undoc-members:
    :show-inheritance:
    :exclude-members: Dataset

    .. class :: Dataset

        A wind dataset

        .. automethod :: __init__

           .. seealso :: :meth:`open_latest`

        After initalisation, the following attributes are available:

        .. attribute:: array

            A :class:`mmap.mmap` object; the entire dataset mapped into memory.

        .. attribute:: ds_time

            The forecast time of this dataset (:class:`datetime.datetime`).

        …and this method:

        .. automethod :: close

        The following attributes are class attributes:

        .. autoattribute :: shape

        .. attribute :: axes

            The values of the points on each axis: a 5-(named)tuple ``(hour, pressure variable, latitude, longitude)``.

            For example, ``axes.pressure[4]`` is ``900``—points in cells ``dataset.array[a][4][b][c][d]`` correspond to data at 900mb.

        .. autoattribute :: element_type
        .. autoattribute :: element_size
        .. autoattribute :: size
        .. autoattribute :: SUFFIX_GRIBMIRROR
        .. autoattribute :: DEFAULT_DIRECTORY

        These "utility" class methods are available:

        .. automethod :: filename
        .. automethod :: listdir
        .. automethod :: open_latest

tawhiri.download module
-----------------------

.. automodule:: tawhiri.download
    :members:
    :undoc-members:
    :show-inheritance:

tawhiri.interpolate module
--------------------------

.. module:: tawhiri.interpolate

.. function:: make_interpolator(dataset)

    Produce a function that can get wind data from `dataset`
    (a :class:`tawhiri.dataset.Dataset`).


    This function returns a closure:

    .. currentmodule:: closure

    .. function:: f(hour, alt, lat, lng)

        :return: delta lat, lon and alt

.. seealso:: implementation
.. seealso:: wind_data

    The interpolation code is not documented here. Please see the source
    `on GitHub <https://github.com/cuspaceflight/tawhiri/blob/master/tawhiri/interpolate.pyx>`_.

tawhiri.models module
---------------------

.. automodule:: tawhiri.models
    :members:
    :undoc-members:
    :show-inheritance:

tawhiri.solver module
---------------------

.. module:: tawhiri.solver

.. function:: solve(t, lat, lng, alt, chain)

    Solve from initial conditions `t`, `lat`, `lng` and `alt`, using models
    and termination criteria from `chain`, an iterable of (model, terminator)
    pairs which make up each stage of the flight.

tawhiri.api module
-----------------------

.. automodule:: tawhiri.api
    :members:
    :undoc-members:
    :show-inheritance:

Module contents
---------------

.. automodule:: tawhiri
    :members:
    :undoc-members:
    :show-inheritance:
