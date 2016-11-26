import sys
import os
import fnmatch
from setuptools import setup, Extension

try:
     from Cython.Build import cythonize
     cython_present = True
except ImportError:
     cython_present = False

if cython_present:
    ext_modules = cythonize("tawhiri/*.pyx")
else:
    files = fnmatch.filter(os.listdir("tawhiri"), "*.c")
    submodules = [n[:-2] for n in files]
    ext_modules = [Extension('tawhiri.' + sm, ['tawhiri/' + sm + '.c'])
                   for sm in submodules]

try:
    import pypandoc
    long_description = pypandoc.convert('README.md', 'rst')
except (IOError, ImportError):
    long_description = ''

def get_version():
    with open("tawhiri/__init__.py") as f:
        for line in f:
            if line.startswith("__version__"):
                return line[15:-2]
    raise Exception("Could not find version number")

entry_points = {
        "console_scripts": [
            "tawhiri-webapp = tawhiri.manager:main",
        ],
}

setup(
    name="Tawhiri",
    version=get_version(),
    author='Cambridge University Spaceflight',
    author_email='contact@cusf.co.uk',
    packages=['tawhiri'],
    package_data={"tawhiri": ["template.kml"]},
    zip_safe=False,
    entry_points=entry_points,
    ext_modules=ext_modules,
    url='http://www.cusf.co.uk/wiki/tawhiri:start',
    license='GPLv3+',
    description='High Altitude Balloon Landing Prediction Software',
    long_description=long_description,
    test_suite='nose.collector',
    tests_require=['nose', 'mock'],
    install_requires=[
        "magicmemoryview",
        "ruaumoko",
        "Flask",
        "Flask-Script",
        "strict-rfc3339",
        "gunicorn"
    ],
    classifiers=[
        'Development Status :: 4 - Beta',
        'Intended Audience :: Science/Research',
        'License :: OSI Approved :: GNU General Public License v3 or later (GPLv3+)',
        'Programming Language :: Python :: 3.5',
        'Topic :: Scientific/Engineering',
    ],
)
