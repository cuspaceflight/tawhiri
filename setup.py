from distutils.core import setup
from Cython.Build import cythonize

setup(
    name="Tawhiri",
    ext_modules = cythonize("tawhiri/*.pyx")
)
