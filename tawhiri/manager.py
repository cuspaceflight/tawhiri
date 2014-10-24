# Copyright 2014 (C) Rich Wareham <rich.cusf@richwareham.com>
#
# This file is part of Tawhiri.
#
# Tawhiri is free software: you can redistribute it and/or modify
# it under the terms of the GNU General Public License as published by
# the Free Software Foundation, either version 3 of the License, or
# (at your option) any later version.
#
# Tawhiri is distributed in the hope that it will be useful,
# but WITHOUT ANY WARRANTY; without even the implied warranty of
# MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
# GNU General Public License for more details.
#
# You should have received a copy of the GNU General Public License
# along with Tawhiri.  If not, see <http://www.gnu.org/licenses/>.
"""
Command-line manager for API webapp

"""
import os
from flask.ext.script import Manager
from .api import app
manager = Manager(app)

def main():
    if 'TAWHIRI_SETTINGS' in os.environ:
        app.config.from_envvar('TAWHIRI_SETTINGS')
    return manager.run()
