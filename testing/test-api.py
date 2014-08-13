import sys
from os.path import abspath, split, join
sys.path.append(join(split(abspath(__file__))[0], '..'))

from tawhiri import api
api.app.run(debug=True)
