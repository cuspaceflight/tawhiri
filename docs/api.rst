API
===

Tawhiri provides a simple API for requesting predictions. The current API
version is `Version 1`_.

Version 1
---------

API Endpoint
~~~~~~~~~~~~~
There is a single endpoint, http://predict.cusf.co.uk/api/v1/, to which ``GET``
requests must be made.

Profiles
~~~~~~~~
Tawhiri predefines multiple flight profiles which contain a description of the
model chain to be used when predicting a specific flight type.

Tawhiri currently supports the following profiles:
 * `Standard Profile`_
 * `Float Profile`_

Standard Profile
^^^^^^^^^^^^^^^^
A profile for the standard high altitude balloon situation of ascent at a
constant rate followed by burst and subsequent descent at terminal velocity
under parachute with a predetermined sea level descent rate.

The API refers to this profile as ``standard_profile``.

Float Profile
^^^^^^^^^^^^^
A profile for the typical floating balloon situation of ascent at constant
altitude to a float altitude which persists for some amount of time before
stopping. Descent is not predicted when using this profile.

The API refers to this profile as ``float_profile``.

Requests
~~~~~~~~


Responses
~~~~~~~~~


Errors
~~~~~~

Error Types
^^^^^^^^^^^
