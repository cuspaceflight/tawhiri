import sys
import pygrib

for record in pygrib.open("datasets/2013070912.gribmirror"):
    print record
