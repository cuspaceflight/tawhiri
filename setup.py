import sys
from setuptools import setup
from Cython.Build import cythonize

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

setup(
    name="Tawhiri",
    version=get_version(),
    author='Cambridge University Spaceflight',
    author_email='contact@cusf.co.uk',
    packages=['tawhiri'],
    entry_points={
        "console_scripts": [
            "tawhiri-download = tawhiri.downloader:main"
        ]
    },
    ext_modules = cythonize("tawhiri/*.pyx"),
    url='http://www.cusf.co.uk/wiki/tawhiri:start',
    license='GPLv3+',
    description='High Altitude Balloon Landing Prediction Software',
    long_description=long_description,
    test_suite='nose.collector',
    tests_require=['nose', 'mock'],
    install_requires=[
        "Cython",
        "magicmemoryview",
        "ruaumoko"
    ],
    classifiers=[
        'Development Status :: 4 - Beta',
        'Intended Audience :: Science/Research',
        'License :: OSI Approved :: GNU General Public License v3 or later (GPLv3+)',
        'Programming Language :: Python :: 3.3',
        'Topic :: Scientific/Engineering',
    ],
)
