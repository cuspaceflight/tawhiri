
function Request() {
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

    var parent = this;

    this.rerun = function() {
        this.numberOfFails = 0;
        this.status = 'running';

        this.submitForm(this.CSVParseCallbackFunction, this.CSVParseCallbackArgs, this.data);
    };

    this.pollForFinishedStatus = function() {
        this.shouldKeepPollingStatus = true;
        this.hasFinished = false;
        this.setStatusCheck();
    };


    this.submitForm = function(CSVParseCallback, args, data) {
        this.CSVParseCallbackFunction = CSVParseCallback;
        this.CSVParseCallbackArgs = args;
        this.data = data;

        $.ajax({
            data: data || $("#prediction-form").serialize(),
            cache: false,
            url: this.base_url + 'ajax.php?action=submitForm',
            type: 'POST',
            dataType: 'json',
            error: function(xhr, status, error) {
                console.log('sending form data failed; ' + status + '; ' + error);
                parent.status = 'failed, should rerun';
                console.log(xhr);
            },
            success: function(data) {
                console.log(data);
                if (data.valid === 'false') {
                    infoAlert('Error submitting prediction form, some of the submitted data appeared invalid <br/>' + data.error, 'error');
                    parent.status = 'failed';
                } else if (data.valid === 'true') {
                    parent.uuid = data.uuid;
                    console.log('Prediction form submitted with uuid ' + parent.uuid);
                    parent.isBackendWorking = true;
                    parent.pollForFinishedStatus();
                } else {
                    console.log('Error submitting prediction form, invalid data.valid');
                    parent.status = 'failed, should rerun';
                }
            }
        });
    };

    this.setStatusCheck = function() {
        window.setTimeout(function() {
            parent.checkStatus();
        }, parent.statusPollInterval);
    };

    this.checkStatus = function() {
        $.ajax({
            url: parent.base_url + 'preds/' + parent.uuid + '/progress.json',
            cache: false,
            dataType: 'json',
            timeout: parent.statusCheckTimeout,
            error: function(xhr, status, error) {
                if (status === 'timeout') {
                    if (parent.numberOfFails <= parent.maxNumberOfFails) {
                        parent.numberOfFails++;
                        console.log('Status update failed, timeout (>5s). trying again', 'info', 'info');
                        parent.setStatusCheck();
                    } else {
                        console.log('Status update failed, maximum number of attempts reached. Aborting.');
                        parent.status = 'failed, should rerun';
                    }
                } else {
                    //alert(status);
                    if (parent.numberOfFails <= parent.maxNumberOfFails) {
                        parent.numberOfFails++;
                        console.log('Status update failed. trying again; ' + status + '; ' + error, 'info', 'info');
                        parent.setStatusCheck();
                    } else {
                        console.log('Status update failed, maximum number of attempts reached. Aborting.');
                        parent.status = 'failed, should rerun';
                    }
                }
            },
            success: function(data) {
                if (data.pred_complete === false) {
                    if (data.pred_running === false) {
                        console.log('Error: predictor not finished but not running');
                        parent.status = 'failed, should rerun';
                        return;
                    }
                    parent.setStatusCheck();
                } else if (data.pred_complete === true) {
                    parent.getCSVData();
                } else {
                    console.log('Error: predictor status invalid');
                    parent.status = 'failed, should rerun';
                }
            }
        });
    };

    this.getCSVData = function() {
        $.get(parent.base_url + 'ajax.php', {action: 'getCSV', uuid: parent.uuid}, function(data) {
            if (data !== null) {
                //console.log('Got CSV data from server');
                if (parent.CSVParseCallbackFunction(data, parent.CSVParseCallbackArgs)) {
                    //console.log('Finished parsing CSV data');
                    parent.status = 'success';
                } else {
                    console.log('Error: Parsing CSV data failed');
                    parent.status = 'failed, should rerun';
                }
            } else {
                console.log('Error: no CSV data actually returned');
                parent.status = 'failed, should rerun';
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

function Map() {
    var parent = this;
    this.markers = [];
    this.paths = {};
    this.pathPointInfoWindows = [];
    this.hourlyPredictionHours = 10;
    this.hourlyPrediction = false;
    this.hourlyPredictionTimes = [];
    this.mapBounds = [];
    this.responsesReceived = 0;
    this.totalResponsesExpected = 1;
    this.willNotComplete = false;
    this.shouldCheckForCompletion = true;
    this.runningRequests = [];
    this.currentHourlySliderValue = null;
    this.selectedPath = null;
    // initialisation code
    this.mapOptions = {
        center: new google.maps.LatLng(52, 0),
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
    this.map = new google.maps.Map(document.getElementById("map-canvas"),
            this.mapOptions);
    google.maps.event.addListener(this.map, 'rightclick', function(event) {
        console.log("Right click event", event);
        parent.setLaunch(event);
        form.open();
    });
    // end init code

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
    };

    this.listenForNextLeftClick = function() {
        $('#map-wrap').addClass('tofront');
        google.maps.event.addListener(parent.map, 'click', function(event) {
            parent.stopListeningForLeftClick();
            console.log("Left click event", event);
            parent.setLaunch(event);
            form.open();
        });
    };
    this.stopListeningForLeftClick = function() {
        $('#map-wrap').removeClass('tofront');
        google.maps.event.clearListeners(parent.map, 'click');
    };

    this.addMapBound = function(latlng) {
        this.mapBounds.push(latlng);
    };

    this.clearMapBounds = function() {
        this.mapBounds = [];
    };

    this.centerMapToBounds = function() {
        var bounds = new google.maps.LatLngBounds();
        for (var i = 0; i < parent.mapBounds.length; i++) {
            bounds.extend(parent.mapBounds[i]);
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
        elevator.getElevationForLocations(positionalRequest, function(results, status) {
            if (status === google.maps.ElevationStatus.OK) {
                // Retrieve the first result
                if (results[0]) {

                    // Open an info window indicating the elevation at the clicked position
                    console.log("The elevation at this point is " + results[0].elevation + " meters.");
                    // set the result
                    $('#inputLaunchAltitude').val(results[0].elevation);
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
        $.each(parent.paths, function(key, val) {
            if (parent.paths[key].pathCollection) {
                for (var j = 0; j < parent.paths[key].pathCollection.length; j++) {
                    parent.paths[key].pathCollection[j].setMap(null);
                }
            }
        });
        delete parent.paths;
        parent.paths = {};
    };

    this.placeMarker = function(latLng) {
        this.removeAllMarkers();
        var marker = new google.maps.Marker({position: latLng,
            map: this.map,
            title: 'Launch Position (Lat: ' + latLng.lb + ', Long: ' + latLng.mb + ')'
        });
        this.markers.push(marker);
    };

    this.removeAllMarkers = function() {
        for (var i = 0; i < this.markers.length; i++) {
            this.markers[i].setMap(null);
        }
    };

    this.parseDrawCSVData = function(data, launchTime) {
        //console.log(data);
        var poly = parent.paths[launchTime].poly;
        var polyw = parent.paths[launchTime].polyw;
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
                parent.addMapBound(latlng);
                //var infostr = '<span class="pathInfoPoint">' + formatTime(time) + "; Lat: " + lat + ", Long: " + lng + ", Alt: " + alt + "m</span>";
                //parent.plotPathInfoPoint(latlng, infostr, pathCollection);
                //console.log(infostr);

                if (key === 0) {
                    // launch position
                    var marker = new google.maps.Marker({
                        position: latlng,
                        icon: MapObjects.upArrow,
                        map: parent.map,
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
            map: parent.map,
            title: 'Landing position',
            visible: false
        });
        pathCollection.push(marker);
        var marker = new google.maps.Marker({
            position: burst_latlng,
            icon: MapObjects.burstCircle,
            map: parent.map,
            title: 'Burst position',
            visible: false
        });
        pathCollection.push(marker);
        parent.paths[launchTime].pathCollection = pathCollection;
        parent.responsesReceived++;
        return true;
    };

    this.plotPath = function(formData, launchTime) {
        console.log("plotting path");
        // thin black line
        var polyOptions = {
            strokeColor: '#000000',
            strokeOpacity: 0.1, //1.0
            strokeWeight: 2,
            zIndex: 10
        };
        var poly = new google.maps.Polyline(polyOptions);
        poly.setMap(this.map);
        // thick transparent line
        var polywOptions = {
            strokeColor: '#000000',
            strokeOpacity: 0.1, //0.3
            strokeWeight: 8,
            zIndex: 20
        };
        var polyw = new google.maps.Polyline(polywOptions);
        polyw.setMap(this.map);
        google.maps.event.addListener(polyw, 'click', function(event) {
            hourlySlider.setValue($.inArray(launchTime, parent.hourlyPredictionTimes));
            //setHourlySlider($.inArray(launchTime, parent.hourlyPredictionTimes));
        });

        var args = {
            poly: poly,
            polyw: polyw
        };

        this.paths[launchTime] = args;

        var request = new Request();
        parent.runningRequests.push(request);
        request.submitForm(
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
            clearTimeout(parent.timeoutPathPoints);
            parent.closeAllPathPointInfoWindows();
            infowindow.open(parent.map);
            parent.pathPointInfoWindows.push(infowindow);
        });
        google.maps.event.addListener(infoPoint, 'mouseout', function() {
            //infowindow.close();
            parent.timeoutPathPoints = setTimeout(function() {
                parent.closeAllPathPointInfoWindows();
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
            return parent.hourlyPredictionTimes[value].toUTCString();
        } catch (e) {
            return ' ';
        }
    };

    this.dimAllPaths = function() {
        $.each(this.paths, function(key, val) {
            parent.dimPath(parent.paths[key]);
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
        if (parent.selectedPath) {
            parent.dimPath(parent.selectedPath);
        } else {
            parent.dimAllPaths();
        }
        parent.unDimPath(path);
        parent.selectedPath = path;
    };

    this.onHourlySliderSlide = function(event) {
        //console.log(event);
        var value = event.value;
        if (value !== parent.currentHourlySliderValue) {
            parent.currentHourlySliderValue = value;
            //console.log(parent.hourlyPredictionTimes);
            parent.selectPath(parent.paths[parent.hourlyPredictionTimes[value]]);
        }
    };

    this.checkForAllResponsesReceived = function() {
        parent.hasChangedProgressBar = false;
        parent.runningRequests = $.grep(parent.runningRequests, function(request, index) {
            console.log(request.status);
            if (request.status === 'success') {
                return false;
            } else if (request.status === 'running') {
                return true;
            } else if (request.status === 'failed, should rerun' && request.numberOfReruns <= request.maxNumberOfReruns) {
                console.log('Rerunning request:');
                console.log(request);
                request.numberOfReruns++;
                request.rerun();
                return true;
            } else {
                // either status is failed, or should rerun but max number
                // of reruns has been reached
                infoAlert('Request failed.', 'error');
                parent.totalResponsesExpected--;
                map.willNotComplete = true;
                return false;
            }
        });
        if (parent.responsesReceived > 0) {
            if (!parent.hasChangedProgressBar) {
                hideProgressBar();
                makeProgressBarStatic();
                setProgressBar(0);
                showProgressBar();
            }
            setProgressBar(100 * parent.responsesReceived / parent.totalResponsesExpected);
        }
        console.log('checking for responses received' + parent.responsesReceived + parent.totalResponsesExpected);
        if (parent.responsesReceived >= parent.totalResponsesExpected) {
            if (parent.responsesReceived > 0) {
                // all responses received
                console.log(currentTimeouts);
                parent.centerMapToBounds();
                if (parent.hourlyPrediction) {
                    hourlySlider = new HourlySlider(map.responsesReceived - 1);
                    hourlySlider.setValue(0);
                    hourlySlider.showPopup();
                    //initHourlySlider(map.responsesReceived - 1);
                    //setHourlySlider(0);
                } else {
                    $.each(parent.paths, function(key, path) {
                        parent.selectPath(path);
                        return;
                    });

                }
            }
            hideProgressBar();
        } else if (parent.shouldCheckForCompletion && parent.totalResponsesExpected > 0) {
            window.setTimeout(parent.checkForAllResponsesReceived, 1000);
        }
    };
}

function SlidingPanel(el) {
    var parent = this;
    this.el = el;
    this.toggleVisibleEl = this.el.children('.formToggleVisible-wrap');
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
        this.width = this.el.outerWidth();
        this.minMarginx = -(this.width - this.toggleVisibleEl.outerWidth());
    };
    this.init = function() {
        this.getMeasurements();

        this.toggleVisibleEl.on('touchend', function(e) {
            if (!parent.hasFirstMoveOccured) {
                e.preventDefault();
                parent.isBeingMoved = false;
                parent.toggle();
            }
        });
        this.el.on('touchstart', function(e) {
            if (parent.isBeingMoved) {
                return;
            }
            console.log('touchstart');
            parent.t = e.timeStamp;
            var touchevent = e.originalEvent;
            parent.x = touchevent.changedTouches[0].pageX;
            parent.y = touchevent.changedTouches[0].pageY;
            parent.deltax = 0;
            parent.deltay = 0;
            parent.isBeingMoved = true;
            parent.hasFirstMoveOccured = false;
        });
        this.el.on('touchmove', function(e) {
            if (!parent.isBeingMoved) {
                return;
            }
            //console.log(e);
            parent.deltat = e.timeStamp - parent.t;
            parent.t = e.timeStamp;
            var touchevent = e.originalEvent;
            var newX = touchevent.changedTouches[0].pageX;
            var newY = touchevent.changedTouches[0].pageY;
            if (parent.x === null) {
                parent.x = newX;
                parent.deltax = parent.x;
            } else {
                parent.deltax = newX - parent.x;
                parent.x = newX;
            }
            if (parent.y === null) {
                parent.y = newY;
                parent.deltay = parent.y;
            } else {
                parent.deltay = newY - parent.y;
                parent.y = newY;
            }
            if (!parent.hasFirstMoveOccured) {
                if (parent.deltax < -parent.minDeltax || parent.deltax > parent.minDeltax) {
                    //console.log('being moved');
                    e.preventDefault();
                    //console.log('touchmove', parent.deltax, parent.deltay);
                    parent.hasFirstMoveOccured = true;
                } else {
                    parent.isBeingMoved = false;
                    return;
                }
            }
            parent.el.css({'margin-left': parent._getBoundedMarginx(parent.getCurrentMarginX() + parent.deltax)});
        });
        this.el.on('touchend', function(e) {
            if (!parent.isBeingMoved) {
                return;
            }
            //console.log('touchend');
            //console.log('touchend', e);
            var velocity = parent.deltax / parent.deltat;
            //console.log('velocity', velocity);
            if (velocity < -parent.snapVelocity) {
                parent.close();
            } else if (velocity > parent.snapVelocity) {
                parent.open();
            } else {
                parent.snapTo();
            }
            parent.isBeingMoved = false;
        });

        //Clicking
        parent.toggleVisibleEl.click(function(event) {
            event.preventDefault();
            console.log('click');
            parent.toggle();
        });
        // hover
        parent.el.hover(function(event) {
            event.preventDefault();
            console.log('hover');
            parent.open();
        });
    };
    this.getCurrentMarginX = function() {
        return parseInt(parent.el.css('margin-left'));
    };
    this._getBoundedMarginx = function(target) {
        if (target < parent.minMarginx) {
            return parent.minMarginx;
        } else if (target > 0) {
            return 0;
        }
        return target;
    };
    this.snapTo = function() {
        var ml = parent.getCurrentMarginX();
        var halfway = -(0.5 * parent.width);
        if (ml < halfway) {
            parent.close();
        } else {
            parent.open();
        }
    };
    this.open = function() {
        console.log('open called', parent.isBeingMoved, parent.isOpen, parent.canBeOpened);
        console.log('will open', !((!parent.isBeingMoved) && (parent.isOpen || (!parent.canBeOpened))));
        if (!parent.isBeingMoved && (parent.isOpen || !parent.canBeOpened)) {
            return;
        }
        parent.el.animate({marginLeft: 0});
        parent.isOpen = true;
    };
    this.close = function() {
        //console.log('close called');
        if (!parent.isBeingMoved && !parent.isOpen) {
            return;
        }
        parent.canBeOpened = false;
        window.setTimeout(function() {
            parent.canBeOpened = true;
        }, 800);

        parent.el.animate({marginLeft: parent._getBoundedMarginx(-parent.width)});
        //parent.el.css({'margin-left': parent._getBoundedMarginx(-parent.width)});
        parent.isOpen = false;
    };
    this.toggle = function() {
        //console.log('is open', parent.isOpen);
        if (parent.isOpen) {
            parent.close();
        } else {
            parent.open();
        }
    };
    this.init();
    return this;
}

function Form() {
    this.slidingPanel = new SlidingPanel($('#form-wrap'));
    var parent = this;
    this.autoPopulateInputs = function() {
        // date time
        var currentTime = new Date();
        var d = new Date(currentTime.getTime() + 5 * 60000); // add 5 minutes into the future

        var month = d.getMonth() + 1; // remove  +1 for new specification
        $('#inputLaunchDay').attr("value", d.getDate());
        $('#inputLaunchMonth option[value=' + month + ']').attr("selected", "selected");
        $('#inputLaunchYear').attr("value", d.getFullYear());
        var hrs = padTwoDigits(d.getHours());
        var mins = padTwoDigits(d.getMinutes());
        $('#inputLaunchHour option[value=' + hrs + ']').attr("selected", "selected");
        $('#inputLaunchMinute option[value=' + mins + ']').attr("selected", "selected");
    };
    this.setUpEventHandling = function() {
        // ajax submission
        $('#prediction-form').submit(function(event) {
            event.preventDefault();
            parent.submit();
            return false;
        });
        // setting position
        $('#btn-set-position').click(function(event) {
            map.listenForNextLeftClick();
            parent.close();
            infoAlert('Now click anywhere on the map', 'info', 3000);
        });
        /*
         // focus
         $('#form-wrap').focus(parent.open);
         */
        // units
        $('.unit-selection .dropdown-menu li a').click(function(event) {
            event.preventDefault();
            var unit = $(this);
            var unit_selection = unit.closest('.unit-selection');
            unit_selection.find('.unit-current').html(unit.html());
            unit_selection.find('input').val(unit.html());
            unit_selection.click();
            return false;
        });
    };
    this.submit = function() {
        var formData = parent.serializeToObject();
        // convert to standard units (m, m/s)
        console.log('unit conversion: ', formData.initial_alt, formData.ascent, formData.burst, formData.drag);
        formData.initial_alt = parent.convertUnits(formData.initial_alt, formData.unitLaunchAltitude);
        formData.ascent = parent.convertUnits(formData.ascent, formData.unitLaunchAscentRate);
        formData.burst = parent.convertUnits(formData.burst, formData.unitLaunchBurstAlt);
        formData.drag = parent.convertUnits(formData.drag, formData.unitLaunchDescentRate);
        console.log('converted to   : ', formData.initial_alt, formData.ascent, formData.burst, formData.drag);
        // remove unrequired fields
        delete formData.unitLaunchAltitude;
        delete formData.unitLaunchAscentRate;
        delete formData.unitLaunchBurstAlt;
        delete formData.unitLaunchDescentRate;
        predict(formData);
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
    this.open = this.slidingPanel.open;
    this.close = this.slidingPanel.close;
    this.toggle = this.slidingPanel.toggle;
    this.serializeToObject = function() {
        var formObj = {};
        var inputs = $('#prediction-form').serializeArray();
        $.each(inputs, function(i, input) {
            formObj[input.name] = input.value;
        });
        return formObj;
    };
    // init code
    this.autoPopulateInputs();
    this.setUpEventHandling();
    // end init code

}

function Notifications() {
    var parent = this;
    this.openNotifications = {};
    this.notificationArea = $('#notification-area');
    this.notificationAreaWrap = $('#notification-area-wrap');
    this.closeAllNotifications = function() {
        parent.openNotifications = {};
        parent.notificationArea.css({
            height: 0
        });
        parent.notificationArea.html('');
    };
    this.closeNotification = function(notification) {
        notification.alert('close');
    };
    this.new = function(msg, type, timeout) {
        var alertData = $.param({msg: msg, type: type});
        if (alertData in parent.openNotifications) {
            parent.closeNotification(parent.openNotifications[alertData]);
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
        var oldHeight = parent.notificationArea.outerHeight();
        parent.notificationArea.append('<div id="' + id + '" class="alert alert-' + alertClass + ' alert-dismissable">' +
                '<button type="button" class="close" data-dismiss="alert" aria-hidden="true">&times;</button>' +
                '<strong>' + alertTitle + '</strong> ' + msg +
                '</div>');
        var notification = $('#' + id);
        //notification.hide();
        parent.notificationArea.css('height', oldHeight);
        // add alert close hook
        $('#' + id).bind('close.bs.alert', function() {
            // remove from global openAlerts array
            parent.openNotifications = $.grep(parent.openNotifications, function(value) {
                return value !== notification;
            });
            parent.notificationArea.css({
                height: parent.notificationArea.outerHeight() - notification.outerHeight(true)
            });
        });
        // display notification
        parent.notificationArea.animate({
            height: parent.notificationArea.outerHeight() + notification.outerHeight(true)
        });
        // set close timeout
        if (timeout) {
            window.setTimeout(function() {
                parent.closeNotification(notification);
            }, timeout);
        }
        parent.openNotifications[alertData] = notification;
    };
}

function HourlySlider(max) {
    var parent = this;
    this.sliderEl = null;
    this.sliderContainer = $("#hourly-time-slider-container");

    this.init = function(max) {
        parent.sliderContainer.html('<input type="text" id="hourly-time-slider"/>');
        parent.sliderEl = $("#hourly-time-slider");
        parent.sliderEl.slider({
            min: 0,
            max: max,
            step: 1,
            value: 0,
            orientation: 'vertical',
            tooltip: 'show',
            selection: 'before',
            formater: map.getHourlySliderTooltip
        }).on('slide', map.onHourlySliderSlide);
        $('#hourly-time-slider-container div.tooltip.right')
                .addClass('left')
                .removeClass('right')
                .css('left', '')
                .css('right', '100%')
                .css('margin-right', '3px');
    };
    
    this.showPopup = function() {
        parent.sliderContainer.show();
        // show info popup
        parent.sliderContainer.popover('show');
        window.setTimeout(function() {
            parent.sliderContainer.popover('hide');
        }, 5000);
        parent.sliderContainer.mousedown(function(event) {
            parent.sliderContainer.popover('hide');
        });
    };
    this.hide = function() {
        parent.sliderContainer.hide();
    };
    this.remove = function() {
        $("#hourly-time-slider-container .slider").remove();
    };
    this.setValue = function(value) {
        parent.sliderEl.slider('setValue', value);
        map.onHourlySliderSlide({value: value});
    };
    this.init(max);
}

function predict(formData) {
    notifications.closeAllNotifications();
    try {
        hourlySlider.remove();
    } catch (e) {
    }
    map.reset();
    showProgressBar();
    makeProgressBarAnimated();
    //console.log(formData);
    var runTime = new Date(
            formData.year,
            formData.month,
            formData.day,
            formData.hour,
            formData.min,
            formData.second,
            0
            );
    if (formData.hourly !== 'on') {
        // is not an hourly prediction
        map.hourlyPrediction = false;
        map.totalResponsesExpected = 1;
        map.plotPath($.param(formData), runTime);
    } else {
        // is an hourly prediction
        map.hourlyPrediction = true;
        var i = 0;
        for (i; i < map.hourlyPredictionHours; i++) {
            var predictionData = $.extend({}, formData);
            var d = new Date(runTime.getTime() + i * 1440000); // add i hours
            predictionData.year = d.getFullYear();
            predictionData.month = d.getMonth();
            predictionData.day = d.getDate();
            predictionData.hour = padTwoDigits(d.getHours());
            predictionData.min = padTwoDigits(d.getMinutes());
            //console.log($.param(predictionData));
            map.hourlyPredictionTimes.push(d);
            map.plotPath($.param(predictionData), d);
        }
        map.totalResponsesExpected = map.hourlyPredictionHours;
    }
    map.checkForAllResponsesReceived();
    form.close();
}


function padTwoDigits(x) {
    x = x + "";
    if (x.length === 1) {
        x = "0" + x;
    }
    return x;
}

function formatTime(d) {
    return padTwoDigits(d.getHours()) + ":" + padTwoDigits(d.getMinutes());
}

function feetToMeters(feet) {
// 1 meter == 0.3048 ft
    return 0.3048 * feet;
}


function showProgressBar() {
    $('#progress-bar-wrapper').show();
}

function makeProgressBarAnimated() {
    $('#progress-bar .progress').addClass('progress-striped active');
    setProgressBar(100);
}

function makeProgressBarStatic() {
    $('#progress-bar .progress').removeClass('progress-striped active');
}

function setProgressBar(perc) {
    $('#progress-bar .progress-bar').css('width', perc + '%');
}

function hideProgressBar() {
    $('#progress-bar-wrapper').hide();
}

//google.maps.event.addDomListener(window, 'load', initialize);

function infoAlert(msg, type, timeout) {
    notifications.new(msg, type, timeout);
}

function onWindowSizeChange() {
    var wasMobile = isMobile;
    isMobile = $(window).width() < 500;
    if (!wasMobile && isMobile) {
        $('#form-wrap').height($('#form-wrap').outerHeight() - 30 + 'px');
    }
    form.open();
    if (wasMobile && !isMobile) {
        $('#form-wrap').height('100%');
    }
}

var elevator;
var map;
var form;
var notifications;
var hourlySlider;
var isMobile = false;
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
    elevator = new google.maps.ElevationService();
    map = new Map();
    form = new Form();
    notifications = new Notifications();
    $(window).resize(onWindowSizeChange);
    onWindowSizeChange();
    $('#hourly-time-slider-container').popover({
        placement: 'left',
        trigger: 'manual',
        template: '<div class="popover hourlySliderInfoPopup"><div class="arrow"></div><h3 class="popover-title"></h3><div class="popover-content"></div></div>'
    });

    /*
     hourlySlider = new HourlySlider(2);
     window.setTimeout(function() {
     hourlySlider.remove();
     hourlySlider = new HourlySlider(5);
     }, 6000);*/
    /*infoAlert('hey');
     window.setTimeout(function() {
     infoAlert('hey');
     }, 3000);*/
    //$('#prediction-form').submit();
}
);