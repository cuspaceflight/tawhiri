function Path(request) {
    var _this = this;

    this.predData = request.predData;
    this.launchTime = request.launchtime;
    this.pathCollection = [];
    this.polyCenter = null;
    this.polyOverlay = null;

    this.init = function() {
        var poly = new google.maps.Polyline(MapObjects.pathCenterUnselected);
        poly.setMap(map.map);
        var polyw = new google.maps.Polyline(MapObjects.pathOverlayUnselected);
        polyw.setMap(map.map);
        google.maps.event.addListener(polyw, 'click', function(event) {
            //console.log('path clicked', event);
            map.hourlySlider.setValueByLaunchtime(_this.launchTime);
        });

        var path = poly.getPath();
        var pathw = polyw.getPath();
        _this.pathCollection = [poly, polyw];
        var stages = {};

        $.each(_this.predData, function(key, stage) {
            stages[stage.stage] = stage;

            $.each(stage.trajectory, function(key, point) {
                var time = new Date(point.datetime);
                var latlng = new google.maps.LatLng(point.latitude, point.longitude);
                path.push(latlng);
                pathw.push(latlng);
                // add location to map bounds ready for recenter
                map.addMapBound(latlng);
            });
        });

        _this.polyCenter = poly;
        _this.polyOverlay = polyw;

        var ascent = stages.ascent.trajectory;
        var launch = ascent[0];
        var burst = ascent[ascent.length - 1];
        var descent = stages.descent.trajectory;
        var landing = descent[descent.length - 1];

        _this.pathCollection.push(new google.maps.Marker({
            position: new google.maps.LatLng(launch.latitude, launch.longitude),
            icon: MapObjects.upArrow,
            map: map.map,
            title: 'Launch position'
        }));

        _this.pathCollection.push(new google.maps.Marker({
            position: new google.maps.LatLng(landing.latitude, landing.longitude),
            icon: MapObjects.landCircle,
            map: map.map,
            title: 'Landing position',
            visible: false
        }));

        _this.pathCollection.push(new google.maps.Marker({
            position: new google.maps.LatLng(burst.latitude, burst.longitude),
            icon: MapObjects.burstCircle,
            map: map.map,
            title: 'Burst position',
            visible: false
        }));

        return true;
    };

    this.dim = function() {
        for (var j = 0; j < _this.pathCollection.length; j++) {
            // hide eveything, including markers
            _this.pathCollection[j].setVisible(false);
        }
        // make paths visible again
        _this.polyCenter.setOptions(MapObjects.pathCenterUnselected);
        _this.polyOverlay.setOptions(MapObjects.pathOverlayUnselected);
    };
    this.unDim = function() {
        for (var j = 0; j < _this.pathCollection.length; j++) {
            // make everything visible
            _this.pathCollection[j].setVisible(true);
        }
        _this.polyCenter.setOptions(MapObjects.pathCenterSelected);
        _this.polyOverlay.setOptions(MapObjects.pathOverlaySelected);
    };

    this.init();
    return this;
}

// A prediction is a collection of "requests": there may be multiple requests for one
// prediction if the user has asked for multiple "hourly" predictions.
function Prediction(predData) {
    var _this = this;
    this.predData = predData;
    this.requests = [];
    this.paths = {}; // time value: path
    this.selectedPathLaunchtime = null;
    this.runningRequests = 0;
    this.totalResponsesExpected = 0;
    this.progressBar = new ProgressBar($('#progress-bar-wrapper'));

    this.init = function() {
        _this.progressBar.show();
        _this.progressBar.makeAnimated();
    };

    this.onRequestUpdate = function(request) {
        switch (request.status) {
            case requestStatus.FINISHED:
                // success, make a path
                _this.runningRequests--;
                _this.paths[request.launchtime] = new Path(request);
                map.hourlySlider.registerTime(request.launchtime);
                break;
            case requestStatus.FAILED:
                notifications.error('Request failed.');
                _this.runningRequests--;
                break;
        }

        if (_this.progressBar.isAnimated) {
            _this.progressBar.makeStatic();
        }
        _this.progressBar.set(100 * (_this.totalResponsesExpected - _this.runningRequests) / _this.totalResponsesExpected);

        if (_this.runningRequests === 0) {
            // all responses received
            _this.progressBar.hide();
            //console.log(currentTimeouts);
            map.centerMapToBounds();
            map.hourlySlider.redraw();
        }

    };
    this.addRequest = function(predData, launchTime) {
        var request = new Request(predData, launchTime, _this.onRequestUpdate);
        _this.requests.push(request);
        _this.runningRequests++;
        _this.totalResponsesExpected++;
        request.submit();
    };

    this.dimAllPaths = function() {
        $.each(_this.paths, function(launchtime, path) {
            path.dim();
        });
    };
    this.selectPathByTime = function(launchtime) {
        //console.log(launchtime, _this.selectedPathLaunchtime, _this.paths[launchtime]);
        if (_this.selectedPathLaunchtime !== null) {
            if (_this.selectedPathLaunchtime === launchtime) {
                return;
            }
            _this.paths[_this.selectedPathLaunchtime].dim();
        } else {
            _this.dimAllPaths();
        }
        if (_this.paths[launchtime] !== undefined) {
            _this.paths[launchtime].unDim();
            _this.selectedPathLaunchtime = launchtime;
        } else {
            _this.selectedPathLaunchtime = null;
        }
    };

    this.remove = function() {
        $.each(_this.paths, function(launchtime, path) {
            if (path.pathCollection) {
                for (var j = 0; j < path.pathCollection.length; j++) {
                    path.pathCollection[j].setMap(null);
                }
            }
        });
        delete _this.paths;
    };

    this.init();
    return this;
}

// A request is a single request to the server for a path; a new Path is created
// and plotted once a request has completed. We keep the launch time on the
// Request since we need to refer to it later (the launch time inside reqParams
// has been mangled).
function Request(reqParams, launchtime, callback) {
    var _this = this;
    this.api_url = '/api/v1/';
    this.statusPollInterval = 1000; //ms
    this.statusCheckTimeout = 15000; //ms
    this.status = requestStatus.NOT_STARTED;
    this.reqParams = reqParams;
    this.launchtime = launchtime;
    this.callback = callback;
    this.predData = null;
    this.submit = function() {
        $.ajax({
            data: _this.reqParams,
            url: _this.api_url,
            type: 'GET',
            dataType: 'json',
            error: function(xhr, status, error) {
                var py_error = xhr.responseJSON.error;
                notifications.alert('Prediction error: ' + py_error.type + ' ' + py_error.description);
                console.log('Prediction error: ' + status + ' ' + error + ' ' + py_error.type + ' ' + py_error.description);
                _this.status = requestStatus.FAILED;
                _this.callback(_this);
            },
            success: function(data) {
                _this.predData = data.prediction;
                _this.status = requestStatus.FINISHED;
                _this.callback(_this);
            }
        });
    };
}

function Notifications($notificationArea) {
    var _this = this;
    this.openNotifications = {_timeout: []};
    this.$notificationArea = $notificationArea;
    this.$currentNotifications = $('#current-notifications');
    this.$mainWrap = $('#main-wrap');
    this.endMainWrapHeight = this.$mainWrap.outerHeight();
    this.closeAllNotifications = function() {
        $.each(_this.openNotifications._timeout, function(index, $notification) {
            $notification.alert('close');
        });
        delete _this.openNotifications._timeout;
        for (var type in _this.openNotifications) {
            if (_this.openNotifications.hasOwnProperty(type)) {
                for (var msg in _this.openNotifications[type]) {
                    if (_this.openNotifications[type].hasOwnProperty(msg)) {
                        var $notification = _this.openNotifications[type][msg].alert('close');
                    }
                }
            }
        }
        _this.openNotifications = {_timeout: []};
    };
    this.notificationCloseCleanup = function($notification, type, msg, timeout) {
        _this.endMainWrapHeight += $notification.outerHeight();
        _this.$mainWrap.height(_this.endMainWrapHeight);
        if (!timeout) {
            delete _this.openNotifications[type][msg];
            if ($.isEmptyObject(_this.openNotifications[type])) {
                delete _this.openNotifications[type];
            }
        } else {
            _this.openNotifications._timeout = $.grep(_this.openNotifications._timeout, function(value) {
                return value != $notification;
            });
        }
    };
    this.new = function(type, msg, timeout) {
        // if no timeout, we append to any existing similar notifications; 
        // if timeout, we add new to top of stack regardless

        var $notification;
        if (!timeout) {
            if (_this.openNotifications[type] === undefined) {
                // make new
                _this.openNotifications[type] = {};
            } else if (_this.openNotifications[type][msg] !== undefined) {
                // add to existing
                $notification = _this.openNotifications[type][msg];
                var $notificationCountBadge = $notification.find('.notification-count');
                var currentCount = parseInt($notificationCountBadge.html());
                $notificationCountBadge
                        .html(currentCount + 1)
                        .show(); // it starts off hidden
                $notification.prependTo(_this.$currentNotifications);
                // do stuff to add a number onto the length
                return $notification;
            }
        }

        var title;
        switch (type) {
            case 'success':
                title = 'Success';
                break;
            case 'warning':
                title = 'Warning';
                break;
            case 'danger':
                title = 'Error';
                break;
            default: // and 'info'
                title = 'Info';
                break;
        }

        // create the notification
        $notification = $('<div class="notification-new alert alert-' + type + ' alert-dismissable">' +
                '<button type="button" class="notification-close btn btn-' + type + '" data-dismiss="alert" aria-hidden="true">&times;</button>' +
                '<span class="notification-count label label-' + type + '" style="display:none;">1</span>' + // badge is hidden by default, start counting at 1
                '<strong>' + title + '</strong> ' + msg +
                '</div>');
        // prepend it to the notification area
        _this.$notificationArea.prepend($notification);
        var notificationHeight = $notification.outerHeight();
        // push it just below the others
        $notification.css('top', notificationHeight);
        // add alert close hook
        $notification.bind('close.bs.alert', function() {
            _this.notificationCloseCleanup($notification, type, msg, timeout);
        });
        // display notification
        $notification.animate({
            top: 0
        });
        _this.endMainWrapHeight -= notificationHeight;
        _this.$mainWrap.animate({
            height: _this.endMainWrapHeight
        }, {done: function() {
                $notification
                        .removeClass('notification-new')
                        .prependTo(_this.$currentNotifications);
                _this.$mainWrap.height($('body').outerHeight() - _this.$currentNotifications.outerHeight());
            }
        });
        // set close timeout
        if (timeout) {
            window.setTimeout(function() {
                $notification.alert('close');
            }, timeout);
        }

        if (timeout) {
            _this.openNotifications._timeout.push($notification);
        } else {
            _this.openNotifications[type][msg] = $notification;
        }
        return $notification;
    };
    this.alert = function(msg, timeout) {
        _this.new('warning', msg, timeout);
    };
    this.error = function(msg, timeout) {
        _this.new('danger', msg, timeout);
    };
    this.info = function(msg, timeout) {
        _this.new('info', msg, timeout);
    };
    this.success = function(msg, timeout) {
        _this.new('success', msg, timeout);
    };
}

var requestStatus = {
    NOT_STARTED: 0,
    RUNNING: 1,
    FAILED: 2,
    FINISHED: 4
};
