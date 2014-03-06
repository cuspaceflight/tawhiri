
function Request() {
    var _this = this;

    //this.base_url = 'http://predict.habhub.org/';
    this.base_url = '';
    this.statusPollInterval = 500; //ms
    this.statusCheckTimeout = 5000; //ms
    this.numberOfFails = 0;
    this.maxNumberOfFails = 3;
    this.status = 'running';
    this.numberOfReruns = 0;
    this.maxNumberOfReruns = 3;
    this.CSVParseCallbackFunction = null;
    this.CSVParseCallbackArgs = null;
    this.data = null;
    this.checkStatusAjaxSettings = null;

    this.rerun = function() {
        this.numberOfFails = 0;
        this.checkStatusAjaxSettings = null;
        this.status = 'running';
        this.submit(this.CSVParseCallbackFunction, this.CSVParseCallbackArgs, this.data);
    };

    this.pollForFinishedStatus = function() {
        this.shouldKeepPollingStatus = true;
        this.hasFinished = false;
        this.setStatusCheck();
    };


    this.submit = function(CSVParseCallback, args, data) {
        this.CSVParseCallbackFunction = CSVParseCallback;
        this.CSVParseCallbackArgs = args;
        this.data = data;

        $.ajax({
            data: data,
            cache: false,
            url: this.base_url + 'ajax.php?action=submitForm',
            type: 'POST',
            dataType: 'json',
            error: function(xhr, status, error) {
                console.log('sending form data failed; ' + status + '; ' + error, xhr);
                _this.status = 'failed, should rerun';
            },
            success: function(data) {
                //console.log(data);
                if (data.valid === 'false') {
                    infoAlert('Error submitting prediction form, some of the submitted data appeared invalid <br/>' + data.error, 'error');
                    _this.status = 'failed';
                } else if (data.valid === 'true') {
                    _this.uuid = data.uuid;
                    //console.log('Prediction form submitted with uuid ' + _this.uuid);
                    _this.isBackendWorking = true;
                    _this.pollForFinishedStatus();
                } else {
                    console.log('Error submitting prediction form, invalid data.valid');
                    _this.status = 'failed, should rerun';
                }
            }
        });
    };

    this.setStatusCheck = function() {
        window.setTimeout(function() {
            _this.checkStatus();
        }, _this.statusPollInterval);
    };

    this.checkStatus = function() {
        // cache settings
        if (this.checkStatusAjaxSettings === null) {
            this.checkStatusAjaxSettings = {
                url: _this.base_url + 'preds/' + _this.uuid + '/progress.json',
                cache: false,
                dataType: 'json',
                timeout: _this.statusCheckTimeout,
                error: function(xhr, status, error) {
                    if (status === 'timeout') {
                        if (_this.numberOfFails <= _this.maxNumberOfFails) {
                            _this.numberOfFails++;
                            console.log('Status update failed, timeout (>5s). trying again', 'info', 'info');
                            _this.setStatusCheck();
                        } else {
                            console.log('Status update failed, maximum number of attempts reached. Aborting.');
                            _this.status = 'failed, should rerun';
                        }
                    } else {
                        //alert(status);
                        if (_this.numberOfFails <= _this.maxNumberOfFails) {
                            _this.numberOfFails++;
                            console.log('Status update failed. trying again; ' + status + '; ' + error, 'info', 'info');
                            _this.setStatusCheck();
                        } else {
                            console.log('Status update failed, maximum number of attempts reached. Aborting.');
                            _this.status = 'failed, should rerun';
                        }
                    }
                },
                success: function(data) {
                    if (data.pred_complete === false) {
                        if (data.pred_running === false) {
                            console.log('Error: predictor not finished but not running');
                            _this.status = 'failed, should rerun';
                            return;
                        }
                        _this.setStatusCheck();
                    } else if (data.pred_complete === true) {
                        _this.getCSVData();
                    } else {
                        console.log('Error: predictor status invalid');
                        _this.status = 'failed, should rerun';
                    }
                }
            };
        }
        $.ajax(this.checkStatusAjaxSettings);
    };

    this.getCSVData = function() {
        $.get(_this.base_url + 'ajax.php', {action: 'getCSV', uuid: _this.uuid}, function(data) {
            if (data !== null) {
                //console.log('Got CSV data from server');
                if (_this.CSVParseCallbackFunction(data, _this.CSVParseCallbackArgs)) {
                    //console.log('Finished parsing CSV data');
                    _this.status = 'success';
                } else {
                    console.log('Error: Parsing CSV data failed');
                    _this.status = 'failed, should rerun';
                }
            } else {
                console.log('Error: no CSV data actually returned');
                _this.status = 'failed, should rerun';
            }
        }, 'json');
    };

}

var MapObjects = {
    // svg symbols
    upArrow: {
        path: google.maps.SymbolPath.FORWARD_CLOSED_ARROW,
        fillColor: 'green',
        fillOpacity: 0,
        scale: 4,
        strokeColor: 'green',
        strokeWeight: 2
    },
    downArrow: {
        path: google.maps.SymbolPath.BACKWARD_CLOSED_ARROW,
        fillColor: 'red',
        fillOpacity: 0,
        scale: 4,
        strokeColor: 'red',
        strokeWeight: 2
    },
    burstCircle: {
        path: google.maps.SymbolPath.CIRCLE,
        fillColor: 'orange',
        fillOpacity: 0,
        scale: 6,
        strokeColor: 'orange',
        strokeWeight: 2
    },
    landCircle: {
        path: google.maps.SymbolPath.CIRCLE,
        fillColor: 'red',
        fillOpacity: 0,
        scale: 6,
        strokeColor: 'red',
        strokeWeight: 2
    }
};

Services = {
    Geolocation: {
        getPosition: function(callback) {
            $.get('http://freegeoip.net/json/', null, callback)
                    .fail(function() {
                        console.log('Geolocation position failed');
                        callback(null);
                    });
        }
    }
};

function Map($wrapper) {
    var _this = this;
    this.$wrapper = $wrapper;
    this.$canvas = this.$wrapper.children('.map-canvas');
    this.canvas = this.$canvas[0];
    this.markers = [];
    this.paths = {};
    this.pathPointInfoWindows = [];
    this.hourlyPredictionHours = 50;
    this.hourlyPrediction = false;
    this.hourlyPredictionTimes = [];
    this.mapBounds = [];
    this.responsesReceived = 0;
    this.totalResponsesExpected = 1;
    this.willNotComplete = false;
    this.shouldCheckForCompletion = true;
    this.runningRequests = [];
    this.hourlySlider = null;
    this.currentHourlySliderValue = null;
    this.selectedPath = null;
    this.progressBar = ProgressBar($('#progress-bar-wrapper'));
    this.map = null;
    this.init = function() {
        // initialisation code

        var mapOptions = {
            center: new google.maps.LatLng(52, 0), // defaults to Cambridge
            zoom: 8,
            mapTypeId: google.maps.MapTypeId.TERRAIN,
            mapTypeControl: true,
            mapTypeControlOptions: {
                style: google.maps.MapTypeControlStyle.HORIZONTAL_BAR,
                position: google.maps.ControlPosition.TOP_CENTER
            },
            panControl: true,
            panControlOptions: {
                position: google.maps.ControlPosition.TOP_RIGHT
            },
            zoomControl: true,
            zoomControlOptions: {
                style: google.maps.ZoomControlStyle.LARGE,
                position: google.maps.ControlPosition.TOP_RIGHT
            },
            scaleControl: true,
            scaleControlOptions: {
                position: google.maps.ControlPosition.TOP_RIGHT
            },
            streetViewControl: true,
            streetViewControlOptions: {
                position: google.maps.ControlPosition.TOP_RIGHT
            }
        };
        _this.map = new google.maps.Map(_this.canvas, mapOptions);
        // map is now initialised

        // guess location from users ip and set up maps
        Services.Geolocation.getPosition(function(data) {
            if (data !== null && isNumber(data.latitude) && isNumber(data.longitude)) {
                _this.map.setCenter(new google.maps.LatLng(data.latitude, data.longitude));
            }
        });
        // prepare elevation service
        _this.elevator = new google.maps.ElevationService();
        // start listening for right clicks to set position
        google.maps.event.addListener(_this.map, 'rightclick', function(event) {
            console.log("Right click event", event);
            _this.setLaunch(event);
            _this.stopListeningForLeftClick();
            form.open();
        });
        // initialise the search box
        _this.initSearchBox();
    };
    this.reset = function() {
        this.removeAllPaths();
        this.clearMapBounds();
        this.responsesReceived = 0;
        this.totalResponsesExpected = 1;
        this.willNotComplete = false;
        this.shouldCheckForCompletion = true;
        this.runningRequests.length = 0;
        this.currentHourlySliderValue = null;
        this.hourlyPredictionTimes.length = 0;
        this.selectedPath = null;
        if (this.hourlySlider !== null) {
            this.hourlySlider.remove();
            this.hourlySlider = null;
        }

    };
    this.initSearchBox = function() {
        _this.geocoder = new google.maps.Geocoder();
        var pac_input = document.getElementById('pac-input');
        var $pac_input = $(pac_input);
        var $pac_input_submit = $('#pac-input-submit');

        var orig_listener;

        function searchAndCenter() {
            var placename = $pac_input.val();
            console.log('sending request for', placename);
            _this.geocoder.geocode({"address": placename}, function(results, status) {
                if (status == google.maps.GeocoderStatus.OK) {
                    var lat = results[0].geometry.location.lat(),
                            lng = results[0].geometry.location.lng(),
                            placeName = results[0].address_components[0].long_name,
                            latlng = new google.maps.LatLng(lat, lng);
                    _this.map.setCenter(latlng);
                    _this.map.fitBounds(results[0].geometry.viewport);
                } else if (status == google.maps.GeocoderStatus.ZERO_RESULTS) {
                    console.log('no results found for', placename);
                } else {
                    console.log('error submitting search for', placename);
                }
            });
        }

        function selectNextAutoSuggestion() {
            var suggestion_selected = $(".pac-item-selected").length > 0;
            if (!suggestion_selected) {
                var simulated_downarrow = $.Event("keydown", {keyCode: 40, which: 40});
                orig_listener.apply(pac_input, [simulated_downarrow]);
            }
        }

        function closeAutoComplete() {
            var simulated_enter = $.Event("keydown", {keyCode: 13, which: 13});
            orig_listener.apply(pac_input, [simulated_enter]);
        }

        (function pacSelectFirst(input) {
            // store the original event binding function
            var _addEventListener = (input.addEventListener) ? input.addEventListener : input.attachEvent;

            function addEventListenerWrapper(type, listener) {
                // Simulate a 'down arrow' keypress on hitting 'return' when no pac suggestion is selected,
                // and then trigger the original listener.
                if (type == "keydown") {
                    orig_listener = listener;
                    listener = function(event) {
                        if (event.which == 13) {
                            selectNextAutoSuggestion();
                            searchAndCenter();
                        }
                        orig_listener.apply(input, [event]);
                    };
                }
                // add the modified listener
                _addEventListener.apply(input, [type, listener]);
            }
            if (input.addEventListener)
                input.addEventListener = addEventListenerWrapper;
            else if (input.attachEvent)
                input.attachEvent = addEventListenerWrapper;
        })(pac_input);

        var autocomplete = new google.maps.places.Autocomplete(pac_input);
        $pac_input_submit.click(function(e) {
            selectNextAutoSuggestion();
            searchAndCenter();
            closeAutoComplete();
        });
    };
    this.listenForNextLeftClick = function() {
        _this.$wrapper.addClass('tofront');
        google.maps.event.addListener(_this.map, 'click', function(event) {
            _this.stopListeningForLeftClick();
            console.log("Left click event", event);
            _this.setLaunch(event);
            form.open();
        });
    };
    this.stopListeningForLeftClick = function() {
        _this.$wrapper.removeClass('tofront');
        google.maps.event.clearListeners(_this.map, 'click');
    };
    this.addMapBound = function(latlng) {
        this.mapBounds.push(latlng);
    };
    this.clearMapBounds = function() {
        this.mapBounds.length = 0;
        this.mapBounds = [];
    };
    this.centerMapToBounds = function() {
        var bounds = new google.maps.LatLngBounds();
        for (var i = 0; i < _this.mapBounds.length; i++) {
            bounds.extend(_this.mapBounds[i]);
        }
        this.map.fitBounds(bounds);
    };
    this.setLaunch = function(event) {
        console.log('Setting launch position and marker');
        this.setLaunchPosition(event.latLng);
        this.placeMarker(event.latLng);
    };
    this.setLaunchPosition = function(latLng) {
        // set the lat long values
        $('#inputLaunchLat').val(latLng.lat());
        $('#inputLaunchLong').val(latLng.lng());
        // get and set the altitude
        var locations = [latLng];
        var positionalRequest = {
            locations: locations
        };
        _this.elevator.getElevationForLocations(positionalRequest, function(results, status) {
            if (status === google.maps.ElevationStatus.OK) {
                // Retrieve the first result
                if (results[0]) {
                    var elevation = results[0].elevation.toFixed(1);
                    // Open an info window indicating the elevation at the clicked position
                    console.log("The elevation at this point is " + elevation + " meters.");
                    // set the result
                    $('#inputLaunchAltitude').val(elevation);
                    // set units to m
                    $('#unit-current-LaunchAltitude').html('m');
                    $('input[name=unitLaunchAltitude]').val('m');
                } else {
                    infoAlert("No elevation results found", 'error');
                }
            } else {
                infoAlert("Elevation service failed due to: " + status, 'error');
            }
        });
    };
    this.removeAllPaths = function() {
        console.log('deleting all previous paths');
        $.each(_this.paths, function(key, val) {
            if (_this.paths[key].pathCollection) {
                for (var j = 0; j < _this.paths[key].pathCollection.length; j++) {
                    _this.paths[key].pathCollection[j].setMap(null);
                }
            }
        });
        delete _this.paths;
        _this.paths = {};
    };
    this.placeMarker = function(latLng) {
        this.removeAllMarkers();
        var marker = new google.maps.Marker({position: latLng,
            map: this.map,
            title: 'Launch Position (Lat: ' + latLng.lat() + ', Long: ' + latLng.lng() + ')'
        });
        this.markers.push(marker);
    };
    this.removeAllMarkers = function() {
        for (var i = 0; i < this.markers.length; i++) {
            this.markers[i].setMap(null);
        }
        this.markers.length = 0;
    };
    this.parseDrawCSVData = function(data, launchTime) {
        //console.log(data);
        var poly = _this.paths[launchTime].poly;
        var polyw = _this.paths[launchTime].polyw;
        var path = poly.getPath();
        var pathw = polyw.getPath();
        var pathCollection = [poly, polyw];
        var time;
        var lat;
        var lng;
        var alt;
        var latlng;
        var burst_time;
        var burst_lat;
        var burst_lng;
        var burst_alt = -10;
        var burst_latlng;
        $.each(data, function(key, val) {
            // each location, time string
            var results = val.split(',');
            if (results.length === 4) {
                time = new Date(parseInt(results[0]) * 1000); // convert to ms
                lat = parseFloat(results[1]);
                lng = parseFloat(results[2]);
                alt = parseFloat(results[3]);
                //console.log("time: ", time, "; lat: ", lat, "; long: ", lng, "; alt: ", alt);
                latlng = new google.maps.LatLng(lat, lng);
                path.push(latlng);
                pathw.push(latlng);
                // add location to map bounds ready for recenter
                _this.addMapBound(latlng);
                //var infostr = '<span class="pathInfoPoint">' + formatTime(time) + "; Lat: " + lat + ", Long: " + lng + ", Alt: " + alt + "m</span>";
                //_this.plotPathInfoPoint(latlng, infostr, pathCollection);
                //console.log(infostr);

                if (key === 0) {
                    // launch position
                    var marker = new google.maps.Marker({
                        position: latlng,
                        icon: MapObjects.upArrow,
                        map: _this.map,
                        title: 'Launch position'
                    });
                    pathCollection.push(marker);
                }
                if (alt > burst_alt) {
                    burst_time = time;
                    burst_lat = lat;
                    burst_lng = lng;
                    burst_alt = alt;
                    burst_latlng = latlng;
                }
            }
        });
        var marker = new google.maps.Marker({
            position: latlng,
            icon: MapObjects.landCircle,
            map: _this.map,
            title: 'Landing position',
            visible: false
        });
        pathCollection.push(marker);
        var marker = new google.maps.Marker({
            position: burst_latlng,
            icon: MapObjects.burstCircle,
            map: _this.map,
            title: 'Burst position',
            visible: false
        });
        pathCollection.push(marker);
        _this.paths[launchTime].pathCollection = pathCollection;
        _this.responsesReceived++;
        return true;
    };
    this.plotPath = function(formData, launchTime) {
        //console.log("plotting path");
        // thin black line
        var polyOptions = {
            strokeColor: '#000000',
            strokeOpacity: 0.1, //1.0
            strokeWeight: 2,
            zIndex: 10
        };
        var poly = new google.maps.Polyline(polyOptions);
        poly.setMap(this.map);
        // thick trans_this line
        var polywOptions = {
            strokeColor: '#000000',
            strokeOpacity: 0.1, //0.3
            strokeWeight: 8,
            zIndex: 20
        };
        var polyw = new google.maps.Polyline(polywOptions);
        polyw.setMap(this.map);
        google.maps.event.addListener(polyw, 'click', function(event) {
            console.log('path clicked', event);
            _this.hourlySlider.setValue($.inArray(launchTime, _this.hourlyPredictionTimes));
            //setHourlySlider($.inArray(launchTime, _this.hourlyPredictionTimes));
        });
        var args = {
            poly: poly,
            polyw: polyw
        };
        this.paths[launchTime] = args;
        var request = new Request();
        _this.runningRequests.push(request);
        request.submit(
                this.parseDrawCSVData,
                launchTime,
                formData
                //'launchsite=Churchill&second=0&submit=Run+Prediction&lat=52.109878940354896&lon=-0.38898468017578125&initial_alt=28&day=15&month=1&year=2014&hour=21&min=59&ascent=5&burst=3000&drag=5'
                );
    };
    this.plotPathInfoPoint = function(latlng, text, pathCollection) {
        var circleOptions = {
            strokeColor: '#FF0000',
            strokeOpacity: 0,
            strokeWeight: 8,
            fillColor: '#FF0000',
            fillOpacity: 0,
            map: this.map,
            center: latlng,
            radius: 8,
            zIndex: 100
        };
        var infoPoint = new google.maps.Circle(circleOptions);
        pathCollection.push(infoPoint);
        var infowindow = new google.maps.InfoWindow({
            content: text,
            position: latlng
        });
        pathCollection.push(infowindow);
        google.maps.event.addListener(infoPoint, 'mouseover', function() {
            // show point details
            //displayInfoBox(text);
            clearTimeout(_this.timeoutPathPoints);
            _this.closeAllPathPointInfoWindows();
            infowindow.open(_this.map);
            _this.pathPointInfoWindows.push(infowindow);
        });
        google.maps.event.addListener(infoPoint, 'mouseout', function() {
            //infowindow.close();
            _this.timeoutPathPoints = setTimeout(function() {
                _this.closeAllPathPointInfoWindows();
            }, 3000);
        });
    };
    this.closeAllPathPointInfoWindows = function() {
        $.each(this.pathPointInfoWindows, function(key, val) {
            val.close();
        });
    };
    this.getHourlySliderTooltip = function(value) {
        //console.log(value);
        try {
            var time = _this.hourlyPredictionTimes[value];
            var path = _this.paths[time].poly.getPath();
            time = new Date(time.getTime());
            time.setMonth(time.getMonth() - 1); // -1 because we have to add 1 for the old api
            var len = path.getLength();
            var launch_latlng = path.getAt(0);
            var landing_latlng = path.getAt(len - 1);
            //console.log(landing_latlng.lat(), landing_latlng.lng());
            return '<p>Launch: ' + time.toUTCString()
                    + '; at ' + launch_latlng.lat() + ', ' + launch_latlng.lng()
                    + '</p><p>Landing: ' + landing_latlng.lat() + ', ' +
                    landing_latlng.lng() + '</p>';
        } catch (e) {
            return ' ';
        }
    };
    this.dimAllPaths = function() {
        $.each(this.paths, function(key, val) {
            _this.dimPath(_this.paths[key]);
        });
    };
    this.dimPath = function(path) {
        if (path.pathCollection) {
            for (var j = 0; j < path.pathCollection.length; j++) {
                path.pathCollection[j].setVisible(false);
            }
        }
        path.poly.setOptions({
            visible: true,
            strokeOpacity: 0.1,
            strokeColor: '#000000',
            zIndex: 20
        });
        path.polyw.setOptions({
            visible: true,
            strokeOpacity: 0.1,
            zIndex: 30
        });
    };
    this.unDimPath = function(path) {
        //console.log(path);
        if (path.pathCollection) {
            for (var j = 0; j < path.pathCollection.length; j++) {
                path.pathCollection[j].setVisible(true);
            }
        }
        path.poly.setOptions({
            strokeOpacity: 1.0,
            strokeColor: '#00FF5E',
            zIndex: 50
        });
        path.polyw.setOptions({
            visible: true,
            strokeOpacity: 0.3,
            zIndex: 40
        });
    };
    this.selectPath = function(path) {
        //console.log(path);
        if (_this.selectedPath) {
            if (_this.selectedPath === path) {
                return;
            }
            _this.dimPath(_this.selectedPath);
        } else {
            _this.dimAllPaths();
        }
        _this.unDimPath(path);
        _this.selectedPath = path;
    };
    this.onHourlySliderSlide = function(event) {
        //console.log(event);
        var value = event.value;
        if (value !== _this.currentHourlySliderValue) {
            _this.currentHourlySliderValue = value;
            //console.log(_this.hourlyPredictionTimes);
            _this.selectPath(_this.paths[_this.hourlyPredictionTimes[value]]);
        }
    };
    this._filterRunningRequests = function(request, index) {
        //console.log(request.status);
        if (request.status === 'success') {
            return false;
        } else if (request.status === 'running') {
            return true;
        } else if (request.status === 'failed, should rerun' && request.numberOfReruns <= request.maxNumberOfReruns) {
            console.log('Rerunning request:', request);
            request.numberOfReruns++;
            request.rerun();
            return true;
        } else {
            // either status is failed, or should rerun but max number
            // of reruns has been reached
            infoAlert('Request failed.', 'error');
            _this.totalResponsesExpected--;
            _this.willNotComplete = true;
            return false;
        }
    };
    this.checkForAllResponsesReceived = function() {
        _this.runningRequests = $.grep(_this.runningRequests, _this._filterRunningRequests);
        if (_this.responsesReceived > 0) {
            if (_this.progressBar.isAnimated) {
                _this.progressBar.makeStatic();
            }
            _this.progressBar.set(100 * _this.responsesReceived / _this.totalResponsesExpected);
        }
        //console.log('checking for responses received' + _this.responsesReceived + _this.totalResponsesExpected);
        if (_this.responsesReceived >= _this.totalResponsesExpected) {
            if (_this.responsesReceived > 0) {
                // all responses received
                _this.progressBar.hide();
                //console.log(currentTimeouts);
                _this.centerMapToBounds();
                _this.hourlySlider = new HourlySlider(_this.responsesReceived - 1);
            }
        } else if (_this.shouldCheckForCompletion && _this.totalResponsesExpected > 0) {
            window.setTimeout(_this.checkForAllResponsesReceived, 1000);
        }
    };
    this.init();
    return this;
}

function SlidingPanel($element) {
    var _this = this;
    this.$element = $element;
    this.$toggleVisibleEl = this.$element.children('.formToggleVisible-wrap');
    this.width = null;
    this.minMarginx = null;
    this.snapVelocity = 0.1; // velocity (px/ms) to register as a final slide
    this.x = null;
    this.y = null;
    this.deltax = 0;
    this.deltay = 0;
    this.hasFirstMoveOccured = false;
    this.t = null;
    this.deltat = null;
    this.isOpen = false;
    this.isBeingMoved = false;
    this.canBeOpened = true;
    this.minDeltax = 3; // min pixels moved to register as a sliding action

    this.getMeasurements = function() {
        this.width = this.$element.outerWidth();
        this.minMarginx = -(this.width - this.$toggleVisibleEl.outerWidth());
    };
    this.init = function() {
        this.getMeasurements();
        $(window).resize(function() {
            _this.getMeasurements(); // this can cause lag when resizing the window
            _this.open();
        });
        this.$toggleVisibleEl.on('touchend', function(e) {
            if (!_this.hasFirstMoveOccured) {
                e.preventDefault();
                _this.isBeingMoved = false;
                _this.toggle();
            }
        });
        this.$element.on('touchstart', function(e) {
            if (_this.isBeingMoved) {
                return;
            }
            //console.log('touchstart');
            _this.t = e.timeStamp;
            var touchevent = e.originalEvent;
            _this.x = touchevent.changedTouches[0].pageX;
            _this.y = touchevent.changedTouches[0].pageY;
            _this.deltax = 0;
            _this.deltay = 0;
            _this.isBeingMoved = true;
            _this.hasFirstMoveOccured = false;
        });
        this.$element.on('touchmove', function(e) {
            if (!_this.isBeingMoved) {
                return;
            }
            //console.log(e);
            _this.deltat = e.timeStamp - _this.t;
            _this.t = e.timeStamp;
            var touchevent = e.originalEvent;
            var newX = touchevent.changedTouches[0].pageX;
            var newY = touchevent.changedTouches[0].pageY;
            if (_this.x === null) {
                _this.x = newX;
                _this.deltax = _this.x;
            } else {
                _this.deltax = newX - _this.x;
                _this.x = newX;
            }
            if (_this.y === null) {
                _this.y = newY;
                _this.deltay = _this.y;
            } else {
                _this.deltay = newY - _this.y;
                _this.y = newY;
            }
            if (!_this.hasFirstMoveOccured) {
                if (_this.deltax < -_this.minDeltax || _this.deltax > _this.minDeltax) {
                    //console.log('being moved');
                    e.preventDefault();
                    //console.log('touchmove', _this.deltax, _this.deltay);
                    _this.hasFirstMoveOccured = true;
                } else {
                    _this.isBeingMoved = false;
                    return;
                }
            }
            _this.$element.css({'margin-left': _this._getBoundedMarginx(_this.getCurrentMarginX() + _this.deltax)});
        });
        this.$element.on('touchend', function(e) {
            if (!_this.isBeingMoved) {
                return;
            }
            //console.log('touchend');
            //console.log('touchend', e);
            var velocity = _this.deltax / _this.deltat;
            //console.log('velocity', velocity);
            if (velocity < -_this.snapVelocity) {
                _this.close();
            } else if (velocity > _this.snapVelocity) {
                _this.open();
            } else {
                _this.snapTo();
            }
            _this.isBeingMoved = false;
        });
        //Clicking
        _this.$toggleVisibleEl.click(function(event) {
            event.preventDefault();
            //console.log('click');
            _this.toggle();
        });
        // hover
        _this.$element.hover(function(event) {
            event.preventDefault();
            //console.log('hover');
            _this.open();
        });
    };
    this.getCurrentMarginX = function() {
        return parseInt(_this.$element.css('margin-left'));
    };
    this._getBoundedMarginx = function(target) {
        if (target < _this.minMarginx) {
            return _this.minMarginx;
        } else if (target > 0) {
            return 0;
        }
        return target;
    };
    this.snapTo = function() {
        var ml = _this.getCurrentMarginX();
        var halfway = -(0.5 * _this.width);
        if (ml < halfway) {
            _this.close();
        } else {
            _this.open();
        }
    };
    this.open = function() {
        //console.log('open called', _this.isBeingMoved, _this.isOpen, _this.canBeOpened);
        //console.log('will open', !((!_this.isBeingMoved) && (_this.isOpen || (!_this.canBeOpened))));
        if (!_this.isBeingMoved && (_this.isOpen || !_this.canBeOpened)) {
            return;
        }
        _this.$element.animate({marginLeft: 0});
        _this.isOpen = true;
    };
    this.close = function() {
        //console.log('close called');
        if (!_this.isBeingMoved && !_this.isOpen) {
            return;
        }
        _this.canBeOpened = false;
        window.setTimeout(function() {
            _this.canBeOpened = true;
        }, 800);
        _this.$element.animate({marginLeft: _this._getBoundedMarginx(-_this.width)});
        //_this.$element.css({'margin-left': _this._getBoundedMarginx(-_this.width)});
        _this.isOpen = false;
    };
    this.toggle = function() {
        //console.log('is open', _this.isOpen);
        if (_this.isOpen) {
            _this.close();
        } else {
            _this.open();
        }
    };
    this.init();
    return this;
}

function nearestMinute(date, minutes) {
    if (minutes === null) {
        mintues = 1;
    }
    var coeff = 1000 * 60 * minutes;
    return new Date(Math.round(date.getTime() / coeff) * coeff);
}
function ceilMinute(date, minutes) {
    if (minutes === null) {
        mintues = 1;
    }
    var coeff = 1000 * 60 * minutes;
    return new Date(Math.ceil(date.getTime() / coeff) * coeff);
}
function floorMinute(date, minutes) {
    if (minutes === null) {
        mintues = 1;
    }
    var coeff = 1000 * 60 * minutes;
    return new Date(Math.floor(date.getTime() / coeff) * coeff);
}

function Form($wrapper) {
    var _this = this;
    this.$wrapper = $wrapper;
    this.slidingPanel = new SlidingPanel(this.$wrapper);
    this.open = this.slidingPanel.open;
    this.close = this.slidingPanel.close;
    this.toggle = this.slidingPanel.toggle;
    this.input_launch_day = $('#inputLaunchDay');
    this.input_launch_month = $('#inputLaunchMonth');
    this.input_launch_year = $('#inputLaunchYear');
    this.input_launch_hour = $('#inputLaunchHour');
    this.input_launch_minute = $('#inputLaunchMinute');
    this.maxPredictionHours = 180; // latest prediction available
    this.minPredictionHours = 100; // earliest prediction permissible
    this.currentDate = null;
    this.maxPrediction = null;
    this.minPrediction = null;
    this.calculateDates = function() {
        var date = new Date();
        _this.currentDate = ceilMinute(date, 5);
        _this.minPrediction = new Date(_this.currentDate.getTime() - this.minPredictionHours * 1000 * 60 * 60);
        _this.maxPrediction = floorMinute(new Date(date.getTime() + this.maxPredictionHours * 1000 * 60 * 60), 5);
        //console.log(_this.maxPrediction);
    };
    this.isValidTime = function(date) {
        return date >= _this.minPrediction && date >= _this.maxPrediction;
    };
    this._validateMinutesHourly = function() {
        var $date = $('#dateTimePicker').datetimepicker('getDate');
        var selectedTime = new Date($date.val());
        selectedTime.setHours($('#inputLaunchHour option:selected').val());
        selectedTime.setMinutes($('#inputLaunchMinute option:selected').val());
        $('#inputLaunchMinute option').removeAttr('disabled');
        var $selectedHour = $('#inputLaunchHour option:selected');
        if (selectedTime.toDateString() === _this.minPrediction.toDateString()
                && $selectedHour.val() == _this.minPrediction.getHours()) {
            var minMins = _this.minPrediction.getMinutes();
            $('#inputLaunchMinute option').each(function() {
                var $option = $(this);
                if ($option.val() < minMins) {
                    $option.attr("disabled", "disabled");
                }
            });
            var $selected = $('#inputLaunchMinute option:selected');
            if ($selected.val() < minMins) {
                // deselect currently selected option
                $selected.removeAttr('selected');
                // select earliest allowed option
                $('#inputLaunchMinute option:not(:disabled)').first().prop('selected', true);
            }
        } else if (selectedTime.toDateString() === _this.maxPrediction.toDateString()
                && $selectedHour.val() == _this.maxPrediction.getHours()) {
            var maxMins = _this.maxPrediction.getMinutes();
            $('#inputLaunchMinute option').each(function() {
                var $option = $(this);
                if ($option.val() > maxMins) {
                    $option.attr("disabled", "disabled");
                }
            });
            var $selected = $('#inputLaunchMinute option:selected');
            if ($selected.val() > maxMins) {
                // deselect currently selected option
                $selected.removeAttr('selected');
                // select earliest allowed option
                $('#inputLaunchMinute option:not(:disabled)').last().prop('selected', true);
            }
        }

        // validate the hourly predictor
        var d = _this.maxPrediction - selectedTime; // + (1000*60*60*24);
        //console.log('max:', _this.maxPrediction, 'selected:', selectedTime, 'difference:', d);
        var maxHourlyPrediction = Math.floor(d / (1000 * 60 * 60)) + 1;
        // +1 hour because of the way the predictions are run later.
        // i.e. 1 = current time
        //console.log('maxHourlyPrediction', maxHourlyPrediction);
        $('#hourly option').each(function() {
            var $option = $(this);
            if ($option.val() > maxHourlyPrediction) {
                $option.attr("disabled", "disabled");
            } else {
                $option.removeAttr('disabled');
            }
        });
        var $selected = $('#hourly option:selected');
        if ($selected.val() > maxHourlyPrediction) {
            // deselect currently selected option
            $selected.removeAttr('selected');
            // select max allowed option
            $('#hourly option:not(:disabled)').last().prop('selected', true);
        }
        // remove old dynamically inserted max value
        $('#hourly option.dynamicallyInsertedMaxValue').remove();
        if (!($('#hourly option[value="' + maxHourlyPrediction + '"]').length)) {
            // add an option for the latest permissible hourly prediction
            $('#hourly option:not(:disabled)').last().after('<option class="dynamicallyInsertedMaxValue" value="' + maxHourlyPrediction + '">' + maxHourlyPrediction + '</option>');
        }
    };
    this.setUpDatePicker = function() {
        var onSelectDate = function(dateTime) {
            $("input[name='day']").val(dateTime.getDate());
            $("input[name='month']").val(dateTime.getMonth() + 1);
            $("input[name='year']").val(dateTime.getFullYear());
            $('#displayLaunchDate').html(dateTime.getDate() + ' '
                    + months[dateTime.getMonth()] + ' '
                    + dateTime.getFullYear());
            $('#dateTimePicker-wrapper').collapse('hide');
            // sort out time pickers
            var currentDateString = dateTime.toDateString();
            if (currentDateString === _this.minPrediction.toDateString()) {
                var minHours = _this.minPrediction.getHours();
                $('#inputLaunchHour option').each(function() {
                    var $option = $(this);
                    if ($option.val() < minHours) {
                        $option.attr("disabled", "disabled");
                    } else {
                        $option.removeAttr('disabled');
                    }
                });
                var $selected = $('#inputLaunchHour option:selected');
                if ($selected.val() < minHours) {
                    // deselect currently selected option
                    $selected.removeAttr('selected');
                    // select earliest allowed option
                    $('#inputLaunchHour option:not(:disabled)').first().prop('selected', true);
                }
            } else if (currentDateString === _this.maxPrediction.toDateString()) {
                var maxhours = _this.maxPrediction.getHours();
                $('#inputLaunchHour option').each(function() {
                    var $option = $(this);
                    if ($option.val() > maxhours) {
                        $option.attr("disabled", "disabled");
                    } else {
                        $option.removeAttr('disabled');
                    }
                });
                var $selected = $('#inputLaunchHour option:selected');
                if ($selected.val() > maxhours) {
                    $selected.removeAttr('selected');
                    // select latest allowed option
                    $('#inputLaunchHour option:not(:disabled)').last().prop('selected', true);
                }
            } else {
                $('#inputLaunchHour option').removeAttr('disabled');
                $('#inputLaunchMinute option').removeAttr('disabled');
            }
            _this._validateMinutesHourly();
        };
        $('#dateTimePicker').datetimepicker({
            inline: true,
            minDate: _this.minPrediction.getFullYear() + '/' + (_this.minPrediction.getMonth() + 1) + '/' + _this.minPrediction.getDate(),
            maxDate: _this.maxPrediction.getFullYear() + '/' + (_this.maxPrediction.getMonth() + 1) + '/' + _this.maxPrediction.getDate(),
            //onChangeDateTime: logic,
            //onShow: logic,
            value: _this.currentDate.getFullYear() + '/' + (_this.currentDate.getMonth() + 1) + '/' + _this.currentDate.getDate(),
            scrollMonth: false,
            timepicker: false,
            onSelectDate: onSelectDate
        });
        onSelectDate(_this.currentDate);
        $('#displayLaunchDate').click(function() {
            $('#dateTimePicker-wrapper').collapse('toggle');
        });
    };
    this.predict = function(formData) {
        map.reset();
        notifications.closeAllNotifications();
        map.progressBar.show();
        map.progressBar.makeAnimated();
        //console.log(formData);
        var runTime = new Date(
                formData.year,
                formData.month,
                formData.day,
                formData.hour,
                formData.min,
                formData.second,
                0 // ms
                );
        for (var h = 0; h < formData.hourly; h++) { // < so that we don't add additional hours
            var predictionData = $.extend({}, formData);
            var d = new Date(runTime.getTime() + (h * 60 * 60 * 1000)); // add h hours
            predictionData.year = d.getFullYear();
            predictionData.month = d.getMonth();
            predictionData.day = d.getDate();
            predictionData.hour = padTwoDigits(d.getHours());
            predictionData.min = padTwoDigits(d.getMinutes());
            //console.log($.param(predictionData));
            map.hourlyPredictionTimes.push(d);
            map.plotPath($.param(predictionData), d);
        }
        map.totalResponsesExpected = formData.hourly;
        map.checkForAllResponsesReceived();
        _this.close();
    };
    this.autoPopulateInputs = function() {
        var hrs = padTwoDigits(_this.currentDate.getHours());
        var mins = padTwoDigits(_this.currentDate.getMinutes());
        $('#inputLaunchHour option[value=' + hrs + ']').prop('selected', true);
        $('#inputLaunchMinute option[value=' + mins + ']').prop('selected', true);
    };
    this.setUpEventHandling = function() {
        // ajax submission
        $('#prediction-form').submit(function(event) {
            event.preventDefault();
            _this.submit();
            return false;
        });
        // setting position
        $('#btn-set-position').click(function(event) {
            map.listenForNextLeftClick();
            _this.close();
            infoAlert('Now click anywhere on the map', 'info', 3000);
        });
        // units
        $('.unit-selection .dropdown-menu li a').click(function(event) {
            event.preventDefault();
            var $unit = $(this);
            var $unit_selection = $unit.closest('.unit-selection');
            $unit_selection.find('.unit-current').html($unit.html());
            $unit_selection.find('input').val($unit.html());
            $unit_selection.click();
            return false;
        });
        // hour / minute time change
        $('#inputLaunchHour').on('change.validateMinutesHourly', _this._validateMinutesHourly);
        $('#inputLaunchMinute').on('change.validateMinutesHourly', _this._validateMinutesHourly);
    };
    this.submit = function() {
        var formData = _this.serializeToObject();
        // convert to standard units (m, m/s)
        console.log('unit conversion: ', formData.initial_alt, formData.ascent, formData.burst, formData.drag);
        formData.initial_alt = _this.convertUnits(formData.initial_alt, formData.unitLaunchAltitude);
        formData.ascent = _this.convertUnits(formData.ascent, formData.unitLaunchAscentRate);
        formData.burst = _this.convertUnits(formData.burst, formData.unitLaunchBurstAlt);
        formData.drag = _this.convertUnits(formData.drag, formData.unitLaunchDescentRate);
        console.log('converted to   : ', formData.initial_alt, formData.ascent, formData.burst, formData.drag);
        // remove unrequired fields
        delete formData.unitLaunchAltitude;
        delete formData.unitLaunchAscentRate;
        delete formData.unitLaunchBurstAlt;
        delete formData.unitLaunchDescentRate;
        _this.predict(formData);
    };
    this.convertUnits = function(value, fromUnits) {
        switch (fromUnits) {
            case 'm':
                return value;
                break;
            case 'ft':
                return feetToMeters(value);
                break;
            case 'm/s':
                return value;
                break;
            case 'ft/s':
                return feetToMeters(value);
                break;
            default:
                infoAlert('Unrecognised units ' + fromUnits, 'error');
        }
    };
    this.serializeToObject = function() {
        var formObj = {};
        var $inputs = $('#prediction-form').serializeArray();
        $.each($inputs, function(i, $input) {
            formObj[$input.name] = $input.value;
        });
        return formObj;
    };
    // init code
    this.calculateDates();
    this.setUpDatePicker();
    this.autoPopulateInputs();
    this.setUpEventHandling();
    // end init code

}

function Notifications($notificationArea) {
    var _this = this;
    this.openNotifications = {};
    this.$notificationArea = $notificationArea;
    //this.$notificationAreaWrap = $('#notification-area-wrap');
    this.closeAllNotifications = function() {
        _this.openNotifications = {};
        _this.$notificationArea.css({
            height: 0
        });
        _this.$notificationArea.html('');
    };
    this.closeNotification = function(notification) {
        notification.alert('close');
    };
    this.new = function(msg, type, timeout) {
        var alertData = $.param({msg: msg, type: type});
        if (alertData in _this.openNotifications) {
            _this.closeNotification(_this.openNotifications[alertData]);
        }
        var alertClass, alertTitle;
        switch (type) {
            case 'error':
                alertClass = 'danger';
                alertTitle = 'Error';
                break;
            default:
                alertClass = 'info';
                alertTitle = 'Info';
                break;
        }

        var d = new Date();
        var id = 'alert-' + d.getTime();
        var oldHeight = _this.$notificationArea.outerHeight();
        _this.$notificationArea.append('<div id="' + id + '" class="alert alert-' + alertClass + ' alert-dismissable">' +
                '<button type="button" class="close" data-dismiss="alert" aria-hidden="true">&times;</button>' +
                '<strong>' + alertTitle + '</strong> ' + msg +
                '</div>');
        var $notification = $('#' + id);
        //notification.hide();
        _this.$notificationArea.css('height', oldHeight);
        // add alert close hook
        $('#' + id).bind('close.bs.alert', function() {
            // remove from global openAlerts array
            _this.openNotifications = $.grep(_this.openNotifications, function(value) {
                return value !== $notification;
            });
            _this.$notificationArea.css({
                height: _this.$notificationArea.outerHeight() - $notification.outerHeight(true)
            });
        });
        // display notification
        _this.$notificationArea.animate({
            height: _this.$notificationArea.outerHeight() + $notification.outerHeight(true)
        });
        // set close timeout
        if (timeout) {
            window.setTimeout(function() {
                _this.closeNotification($notification);
            }, timeout);
        }
        _this.openNotifications[alertData] = $notification;
    };
}

function HourlySlider(max) {
    var _this = this;
    this.$sliderEl = null;
    this.$sliderContainer = $("#hourly-time-slider-container");
    this.$infoBoxEl = null;
    this.$infoBoxContainer = $("#current-launch-info-container");
    this.value = null;
    this.init = function(max) {
        _this.$sliderContainer.html('<input type="text" id="hourly-time-slider"/>');
        _this.$sliderEl = $("#hourly-time-slider");
        _this.$sliderEl.slider({
            min: 0,
            max: max,
            step: 1,
            value: 0,
            orientation: 'vertical',
            tooltip: 'hide',
            selection: 'before',
            formater: map.getHourlySliderTooltip
        }).on('slide', function(event) {
            map.onHourlySliderSlide(event);
            _this.onSlide(event);
        });
        _this.$infoBoxContainer.html('<div id="current-launch-info"></div>');
        _this.$infoBoxEl = $('#current-launch-info');
        _this.$infoBoxContainer.show();
        _this.$sliderContainer.show();
        _this.setValue(0);
        if (max > 0) {
            _this.showPopup();
        } else {
            _this.$sliderContainer.hide();
        }
    };
    this.onSlide = function(event) {
        var text = map.getHourlySliderTooltip(event.value);
        _this.setInfoBox(text);
    };
    this.showPopup = function() {
        _this.$sliderContainer.show();
        _this.$infoBoxContainer.show();
        // show info popup
        _this.$sliderContainer.popover('show');
        window.setTimeout(function() {
            _this.$sliderContainer.popover('hide');
            _this.$sliderContainer.popover('disable');
        }, 3000);
    };
    this.hide = function() {
        _this.$sliderContainer.hide();
        _this.$infoBoxContainer.hide();
    };
    this.remove = function() {
        $("#hourly-time-slider-container .slider").remove();
        _this.$infoBoxContainer.html('');
        _this.$infoBoxContainer.hide();
    };
    this.setInfoBox = function(html) {
        _this.$infoBoxEl.html(html);
        _this.$infoBoxContainer.css('margin-left', -0.5 * _this.$infoBoxContainer.outerWidth());
    };
    this.setValue = function(value) {
        _this.value = value;
        _this.$sliderEl.slider('setValue', value);
        _this.setInfoBox(map.getHourlySliderTooltip(value));
        map.onHourlySliderSlide({value: value});
    };
    this.getValue = function(value) {
        return _this.value;
    };
    this.init(max);
}

function ProgressBar($wrapper) {
    var _this = this;
    this.$wrapper = $wrapper;
    this.$element = this.$wrapper.children('.progress');
    this.$bar = this.$element.children('.progress-bar');
    this.isAnimated = false;
    this.show = function() {
        _this.$wrapper.show();
    };
    this.makeAnimated = function() {
        _this.$element.addClass('progress-striped active');
        set(100);
        this.isAnimated = true;
    };
    this.makeStatic = function() {
        _this.$element.removeClass('progress-striped active');
        _this.isAnimated = false;
    };
    this.set = function(perc) {
        _this.$bar.css('width', perc + '%');
    };
    this.hide = function() {
        this.$wrapper.hide();
    };
    return this;
}

function padTwoDigits(x) {
    x = x + "";
    if (x.length === 1) {
        x = "0" + x;
    }
    return x;
}

function isNumber(n) {
    return !isNaN(parseFloat(n)) && isFinite(n);
}

function formatTime(d) {
    return padTwoDigits(d.getHours()) + ":" + padTwoDigits(d.getMinutes());
}

function feetToMeters(feet) {
    // 1 meter == 0.3048 ft
    return 0.3048 * feet;
}

function infoAlert(msg, type, timeout) {
    notifications.new(msg, type, timeout);
}



// GLOBALS
var map;
var form;
var notifications;
var months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
var shortDays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
var oldTimeout = setTimeout;
var currentTimeouts = {};
window.setTimeout = function(callback, timeout) {
    //console.log("timeout started");
    var funcstr = '' + callback;
    funcstr = funcstr.split('\n')[0];
    if (currentTimeouts[funcstr]) {
        currentTimeouts[funcstr]++;
    } else {
        currentTimeouts[funcstr] = 1;
    }
    return oldTimeout(function() {
        //console.log('timeout finished');
        currentTimeouts[funcstr]--;
        if (currentTimeouts[funcstr] <= 0) {
            delete currentTimeouts[funcstr];
        }
        callback();
    }, timeout);
};
function debug(msg) {
    $('#debug').html(msg);
}

function debugAppend(msg) {
    $('#debug').append('<br/>' + msg);
}
function debugClear() {
    debug();
}

$(function() {
    map = new Map($('#map-wrap'));
    form = new Form($('#form-wrap'));
    notifications = new Notifications($('#notification-area'));
});