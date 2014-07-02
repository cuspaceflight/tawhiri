Specific implementation details
===============================

Interpolation
-------------

Introduction
~~~~~~~~~~~~

Consider 2D linear interpolation: you know the values of some quantity at the four corners:

.. math::

    \begin{align*}
    f(0, 0) = a  &&
    f(0, 1) = b  &&
    f(1, 0) = c  &&
    f(1, 1) = d
    \text{,}
    \end{align*}

and you want an estimate for the value at (x, y).

You could first interpolate along the :math:`x` axis, estimating :math:`f(x, 0)` to be :math:`(1 - x)a + xc` and :math:`f(x, 1)` to be :math:`(1 - x)b + xd`.

(As an aside, you might think of :math:`(1 - x)` being a 'weight': how much of :math:`a` we should include in our estimate.)

Then, you could interpolate along the :math:`y` axis, to get

.. math::

    \begin{align*}
    f(x, y) &\approx (1 - y)((1 - x)a + xc) + y((1 - x)b + xd) \\
            &= (1 - x)(1 - y)a + (1 - x)y b + x(1 - y) c + xy d
    \text{.}
    \end{align*}

Note, either from the symmetry or just doing it by hand, that you'd get exactly the same thing if you interpolated along the :math:`y` axis first. You might interpret the quantity :math:`(1 - x)(1 - y)` as a weight for the top left corner, how much of it we should include in the answer.

Functions
~~~~~~~~~

The function `pick3` selects the indices left and right of a given point in time, latitude and longitude (but *not* altitude: see below), and then returns an eight element array (via a C 'out' pointer): each element represents a corner, and contains its indices and its weight (the product of the three numbers between 0 and 1 which represent how close the point we want is to this corner along each axis). Note that the 8 weights will sum to 1. In the implementation, weights are stored in a variable called `lerp`.

`interp3`, given the choices made by `pick3`, interpolates along the time, latitude and longitude axes, giving the value of a variable at any point on one of the pressure levels.

`search` finds the two pressure levels between which the desired altitude lies. It calls `interp3` to get the altitude at a certain point on each pressure level. It uses binary search.

`interp4`, given the choices made by `pick3` and a weight / lerp to use for the altitude interpolation, interpolates along all four axes.

Overview
--------

:func:`tawhiri.interpolate.make_interpolator` casts the dataset to a pointer (see :class:`tawhiri.interpolate.DatasetProxy`) and wraps the Cython function `get_wind` in a closure, which does the main work.

`get_wind`:

* calls `pick3`,
* calls `search`,
* uses `interp3` to get the altitude on the pressure levels above and below the desired point,
* calculates the weight / lerp value for interpolating along the altitude axis,
* calls `interp4` to get the final “wind u” and “wind v” values.

Extrapolation
-------------

If the altitude is below the lowest level (quite common) or above the highest (rarer), we can switch to extrapolation by allowing the weight for altitude interpolation to go out of the range :math:`[0, 1]`.
