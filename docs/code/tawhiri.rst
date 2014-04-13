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

.. automodule:: tawhiri.interpolate
    :members:
    :undoc-members:
    :show-inheritance:

tawhiri.models module
---------------------

.. automodule:: tawhiri.models
    :members:
    :undoc-members:
    :show-inheritance:

tawhiri.solver module
---------------------

.. automodule:: tawhiri.solver
    :members:
    :undoc-members:
    :show-inheritance:


Module contents
---------------

.. automodule:: tawhiri
    :members:
    :undoc-members:
    :show-inheritance:
