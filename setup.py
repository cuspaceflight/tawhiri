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

PY2 = sys.version_info[0] == 2
if PY2:
    entry_points={
        "console_scripts": [
            "tawhiri-download = tawhiri.download:main"
        ]
    }
else:
    entry_points = {}

# Information on where to get non-PyPI packages
dependency_links = [
    'git+https://github.com/cuspaceflight/ruaumoko.git#egg=ruaumoko',
]

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
    dependency_links=dependency_links,
    tests_require=['nose', 'mock'],
    install_requires=[
        "magicmemoryview",
        "ruaumoko",
        "Flask",
        "strict-rfc3339",
        "gunicorn"
    ],
    classifiers=[
        'Development Status :: 4 - Beta',
        'Intended Audience :: Science/Research',
        'License :: OSI Approved :: GNU General Public License v3 or later (GPLv3+)',
        'Programming Language :: Python :: 3.3',
        'Topic :: Scientific/Engineering',
    ],
)
