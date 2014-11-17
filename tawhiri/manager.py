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
from flask import send_file, send_from_directory, redirect, url_for
from flask.ext.script import Manager
from .app import app
manager = Manager(app)

def main():
    if 'TAWHIRI_SETTINGS' in os.environ:
        app.config.from_envvar('TAWHIRI_SETTINGS')

    ui_dir = app.config.get('UI_DIR')
    if ui_dir is not None:
        @app.route('/ui/<path:path>')
        def send_ui(path):
            return send_from_directory(ui_dir, path)

        @app.route('/ui/')
        def send_index():
            return send_file(os.path.join(ui_dir, 'index.html'))

        @app.route('/')
        def send_ui_redirect():
            return redirect(url_for('send_index'))

    return manager.run()
