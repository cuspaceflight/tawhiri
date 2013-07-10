import sys
import pygrib

for record in pygrib.open(sys.argv[1]):
    print record
    print "   ", record.name, record.typeOfLevel, record.forecastTime, record.level
