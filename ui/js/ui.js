function Form($wrapper) {
    var _this = this;
    this.$wrapper = $wrapper;
    this.slidingPanel = new SlidingPanel(this.$wrapper);
    this.open = this.slidingPanel.open;
    this.close = this.slidingPanel.close;
    this.toggle = this.slidingPanel.toggle;
    this.input_launch_hour = $('#inputLaunchHour');
    this.input_launch_minute = $('#inputLaunchMinute');
    this.maxPredictionHours = 180; // latest prediction available
    this.minPredictionHours = 100; // earliest prediction permissible
    this.currentDate = null;
    this.maxPrediction = null;
    this.minPrediction = null;
    this.selectedLaunchDate = null; // will have hours=minutes=seconds=millseconds=0
    this.calculateDates = function() {
        var date = new Date();
        _this.currentDate = ceilMinute(date, 5);
        _this.selectedLaunchDate = new Date(_this.currentDate.getTime());
        _this.minPrediction = new Date(_this.currentDate.getTime() - this.minPredictionHours * 1000 * 60 * 60);
        _this.maxPrediction = floorMinute(new Date(date.getTime() + this.maxPredictionHours * 1000 * 60 * 60), 5);
        //console.log(_this.maxPrediction);
    };
    this.isValidTime = function(date) {
        return date >= _this.minPrediction && date >= _this.maxPrediction;
    };
    this.getSelectedLaunchDatetime = function () {
        var dt = new Date(_this.selectedLaunchDate.getTime());
        dt.setHours($('#inputLaunchHour').val());
        dt.setMinutes($('#inputLaunchMinute').val());
        return dt;
    };
    this.showLaunchDatetimeUTCPreview = function () {
        var dt = _this.getSelectedLaunchDatetime();
        $("#launchDatetimeUTCPreview").text(dt.toISOString());
    };
    this._validateMinutesHourly = function() {
        var selectedTime = _this.getSelectedLaunchDatetime();
        $('#inputLaunchMinute option').removeAttr('disabled');
        var $selectedHour = $('#inputLaunchHour option:selected');
        var $selected;
        if (selectedTime.toDateString() === _this.minPrediction.toDateString() &&
                $selectedHour.val() == _this.minPrediction.getHours()) {
            var minMins = _this.minPrediction.getMinutes();
            $('#inputLaunchMinute option').each(function() {
                var $option = $(this);
                if ($option.val() < minMins) {
                    $option.attr("disabled", "disabled");
                }
            });
            $selected = $('#inputLaunchMinute option:selected');
            if ($selected.val() < minMins) {
                // deselect currently selected option
                $selected.removeAttr('selected');
                // select earliest allowed option
                $('#inputLaunchMinute option:not(:disabled)').first().prop('selected', true);
            }
        } else if (selectedTime.toDateString() === _this.maxPrediction.toDateString() &&
                $selectedHour.val() == _this.maxPrediction.getHours()) {
            var maxMins = _this.maxPrediction.getMinutes();
            $('#inputLaunchMinute option').each(function() {
                var $option = $(this);
                if ($option.val() > maxMins) {
                    $option.attr("disabled", "disabled");
                }
            });
            $selected = $('#inputLaunchMinute option:selected');
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
        $selected = $('#hourly option:selected');
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

        _this.showLaunchDatetimeUTCPreview();
    };
    this.setUpDatePicker = function() {
        var onSelectDate = function(dateTime) {
            $('#displayLaunchDate').html(dateTime.getDate() + ' ' +
                    months[dateTime.getMonth()] + ' ' +
                    dateTime.getFullYear());
            $('#dateTimePicker-wrapper').collapse('hide');

            var dt = new Date(dateTime.getTime());
            dt.setHours(0);
            dt.setMinutes(0);
            dt.setSeconds(0);
            dt.setMilliseconds(0);
            _this.selectedLaunchDate = dt;

            // sort out time pickers
            var currentDateString = dateTime.toDateString();
            var $selected;
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
                $selected = $('#inputLaunchHour option:selected');
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
                $selected = $('#inputLaunchHour option:selected');
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
    this.predict = function(predData, launchDatetime, hourly) {
        map.reset();
        notifications.closeAllNotifications();

        var prediction = new Prediction();
        map.addPrediction(prediction);
        for (var h = 0; h < hourly; h++) { // < so that we don't add additional hours
            predData = $.extend({}, predData);
            var d = new Date(launchDatetime.getTime() + (h * 60 * 60 * 1000)); // add h hours
            predData.launch_datetime = d.toISOString();
            prediction.addRequest(predData, d.getTime());
        }
        _this.close();
    };
    this.autoPopulateInputs = function() {
        var hrs = padTwoDigits(_this.currentDate.getHours());
        var mins = padTwoDigits(_this.currentDate.getMinutes());
        $('#inputLaunchHour option[value=' + hrs + ']').prop('selected', true);
        $('#inputLaunchMinute option[value=' + mins + ']').prop('selected', true);
        _this.showLaunchDatetimeUTCPreview();
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
            notifications.info('Now click anywhere on the map', 2000);
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
        var reqParams = {};

        this.showLaunchDatetimeUTCPreview();

        reqParams.profile = "standard_profile";
        reqParams.launch_latitude  = formData.launch_latitude;
        reqParams.launch_longitude = _this.wrapLongitude(formData.launch_longitude);
        reqParams.launch_altitude  = _this.convertUnits(formData.launch_altitude, formData.unitLaunchAltitude);

        reqParams.ascent_rate     = _this.convertUnits(formData.ascent_rate,     formData.unitLaunchAscentRate);
        reqParams.burst_altitude  = _this.convertUnits(formData.burst_altitude,  formData.unitLaunchBurstAlt);
        reqParams.descent_rate    = _this.convertUnits(formData.descent_rate,    formData.unitLaunchDescentRate);
     
        _this.predict(reqParams, _this.getSelectedLaunchDatetime(), formData.hourly);
    };
    this.wrapLongitude = function(lon) {
        lon %= 360.0;
        return (lon < 0 ? lon + 360 : lon);
    };
    this.convertUnits = function(value, fromUnits) {
        switch (fromUnits) {
            case 'm':
                return value;
            case 'ft':
                return feetToMeters(value);
            case 'm/s':
                return value;
            case 'ft/s':
                return feetToMeters(value);
            default:
                notifications.error('Unrecognised units ' + fromUnits);
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

MapObjects = {
    GPSArrow: {
        path: google.maps.SymbolPath.BACKWARD_CLOSED_ARROW,
        fillColor: 'blue',
        fillOpacity: 1,
        scale: 5,
        strokeColor: 'black',
        strokeWeight: 2
    },
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
    },
    pathCenterUnselected: {
        strokeColor: '#000000',
        strokeOpacity: 0.1, //1.0
        strokeWeight: 2,
        zIndex: 10,
        visible: true
    },
    pathCenterSelected: {
        strokeColor: '#00FF5E',
        strokeOpacity: 1.0,
        strokeWeight: 2,
        zIndex: 50,
        visible: true
    },
    pathOverlayUnselected: {
        strokeColor: '#000000',
        strokeOpacity: 0.1, //0.3
        strokeWeight: 8,
        zIndex: 20,
        visible: true
    },
    pathOverlaySelected: {
        strokeColor: '#000000',
        strokeOpacity: 0.3,
        strokeWeight: 8,
        zIndex: 40,
        visible: true
    }
};

function Map($wrapper) {
    var _this = this;
    this.$wrapper = $wrapper;
    this.$canvas = this.$wrapper.children('.map-canvas');
    this.canvas = this.$canvas[0];
    this.markers = [];
    this.mapBounds = [];
    this.predictions = [];
    this.hourlySlider = new HourlySlider();
    this.currentHourlyLaunchtime = null;
    this.isGpsTracking = false;
    this.gpsTrackerTimeout = null;
    this.gpsTrackerTimeoutInterval = 20 * 1000; // ms
    this.gpsMarker = null;
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
        services.geolocation.getIPPosition(function(position) {
            if (position !== null) {
                _this.map.setCenter(position);
            }
        });
        // set up html5 geolocation
        $('#gps-locate').click(_this.toggleGpsTracker);
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
        _this.removeAllPredictions();
        _this.clearMapBounds();
        _this.currentHourlyLaunchtime = null;
        if (_this.hourlySlider !== null) {
            _this.hourlySlider.remove();
            delete _this.hourlySlider;
            _this.hourlySlider = new HourlySlider();
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
                    notifications.alert('No results found for "' + placename + '"');
                    console.log('no results found for', placename);
                } else {
                    notifications.alert('Error submitting search for ' + placename + '"');
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
    this.addPrediction = function(prediction) {
        _this.predictions.push(prediction);
    };
    this.toggleGpsTracker = function() {
        if (_this.isGpsTracking) {
            _this.stopGpsTracking();
        } else {
            _this.startGpsTracking();
        }
    };
    this.placeGpsMarker = function(latLng) {
        if (_this.gpsMarker === null) {
            // add new
            _this.gpsMarker = new google.maps.Marker({
                icon: MapObjects.GPSArrow,
                position: latLng,
                map: _this.map,
                title: 'Your Current Position (Lat: ' + latLng.lat() + ', Long: ' + latLng.lng() + ')'
            });
        } else {
            // move old
            _this.gpsMarker.setPosition(latLng);
        }
    };
    this.removeGpsMarker = function(latLng) {
        if (_this.gpsMarker !== null) {
            _this.gpsMarker.setMap(null);
            _this.gpsMarker = null;
        }
    };
    this.startGpsTracking = function() {
        console.log('Starting gps tracking');
        _this.isGpsTracking = true;
        $('#gps-locate').removeClass('btn-info').addClass('btn-warning');
        _this.updateGpsPosition(function(position) {
            // center
            _this.map.setCenter(position);
            // place marker
            _this.placeGpsMarker(position);
            // set timeout to run automatically
            function onGpsTimeout() {
                _this.updateGpsPosition(function(position) {
                    // place a marker
                    _this.placeGpsMarker(position);
                });
                _this.gpsTrackerTimeout = setTimeout(onGpsTimeout, _this.gpsTrackerTimeoutInterval);
            }
            _this.gpsTrackerTimeout = setTimeout(onGpsTimeout, _this.gpsTrackerTimeoutInterval); // every 2 seconds
            $('#gps-locate').removeClass('btn-warning').addClass('btn-success');
            notifications.success('Started gps tracking', 3000);
            console.log('Started gps tracking');
        });
    };
    this.stopGpsTracking = function() {
        console.log('Stopping gps tracking');
        clearTimeout(_this.gpsTrackerTimeout);
        _this.removeGpsMarker();
        $('#gps-locate').removeClass('btn-success btn-warning').addClass('btn-info');
        _this.isGpsTracking = false;
        notifications.info('Stopped gps tracking', 3000);
        console.log('Stopped gps tracking');
    };
    this.updateGpsPosition = function(callback) {
        console.log('Updating gps position');
        function handleNoGeolocation(errorFlag) {
            if (errorFlag) {
                notifications.error('The Geolocation service failed.');
                console.log('Error: The Geolocation service failed.');
                _this.stopGpsTracking();
            } else {
                notifications.alert('Your browser doesn\'t support geolocation.');
                console.log('Error: Your browser doesn\'t support geolocation.');
                _this.stopGpsTracking();
            }
        }
        // Try HTML5 geolocation
        if (services.geolocation.gpsGeolocation) {
            services.geolocation.getGPSPosition(function(position) {
                var pos = new google.maps.LatLng(position.coords.latitude,
                        position.coords.longitude);
                callback(pos);
            }, function() {
                handleNoGeolocation(true);
            });
        } else {
            // Browser doesn't support Geolocation
            handleNoGeolocation(false);
        }
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
        _this.mapBounds.push(latlng);
    };
    this.clearMapBounds = function() {
        _this.mapBounds.length = 0;
        _this.mapBounds = [];
    };
    this.centerMapToBounds = function() {
        var bounds = new google.maps.LatLngBounds();
        for (var i = 0; i < _this.mapBounds.length; i++) {
            bounds.extend(_this.mapBounds[i]);
        }
        _this.map.fitBounds(bounds);
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
        services.elevator.getElevationForLocations(positionalRequest, function(results, status) {
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
                    notifications.error('No elevation results found');
                }
            } else {
                notifications.error('Elevation service failed due to: ' + status);
            }
        });
    };
    this.removeAllPredictions = function() {
        console.log('deleting all previous paths');
        $.each(_this.predictions, function(key, prediction) {
            prediction.remove();
        });
        delete _this.predictions;
        _this.predictions = [];
    };
    this.placeMarker = function(latLng) {
        _this.removeAllMarkers();
        var marker = new google.maps.Marker({position: latLng,
            map: _this.map,
            title: 'Launch Position (Lat: ' + latLng.lat() + ', Long: ' + latLng.lng() + ')'
        });
        _this.markers.push(marker);
    };
    this.removeAllMarkers = function() {
        for (var i = 0; i < _this.markers.length; i++) {
            _this.markers[i].setMap(null);
        }
        _this.markers.length = 0;
    };

    this.getHourlySliderTooltip = function(launchtime) {
        //console.log(value);
        try {
            var date = new Date(launchtime);
            var path = _this.predictions[0].paths[launchtime].polyCenter.getPath(); // this should probably be abstracted slightly
            var len = path.getLength();
            var launch_latlng = path.getAt(0);
            var landing_latlng = path.getAt(len - 1);
            //console.log(landing_latlng.lat(), landing_latlng.lng());
            return '<p>Launch: ' + date.toUTCString() +
                    '; at ' + launch_latlng.lat() + ', ' + launch_latlng.lng() +
                    '</p><p>Landing: ' + landing_latlng.lat() + ', ' +
                    landing_latlng.lng() + '</p>';
        } catch (e) {
            return ' ';
        }
    };
    this.onHourlySliderSlide = function(launchtime) {
        //console.log(event);
        if (launchtime !== _this.currentHourlyLaunchtime) {
            _this.currentHourlyLaunchtime = launchtime;
            $.each(_this.predictions, function(index, prediction) {
                prediction.selectPathByTime(launchtime);
            });
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

function HourlySlider() {
    var _this = this;
    this.$sliderEl = null;
    this.$sliderContainer = $("#hourly-time-slider-container");
    this.$infoBoxEl = null;
    this.$infoBoxContainer = $("#current-launch-info-container");
    this.value = null;
    this.valuesTimes = [];
    this.redraw = function() {
        var maxValue = _this.valuesTimes.length - 1;
        _this.$sliderContainer.html('<input type="text" id="hourly-time-slider"/>');
        _this.$sliderEl = $("#hourly-time-slider");
        _this.$sliderEl.slider({
            min: 0,
            max: maxValue,
            step: 1,
            value: 0,
            orientation: 'vertical',
            tooltip: 'hide',
            selection: 'before',
            formater: map.getHourlySliderTooltip
        }).on('slide', function(event) {
            map.onHourlySliderSlide(_this.valuesTimes[event.value]);
            _this.onSlide(event);
        });
        _this.$infoBoxContainer.html('<div id="current-launch-info"></div>');
        _this.$infoBoxEl = $('#current-launch-info');
        _this.$infoBoxContainer.show();
        _this.$sliderContainer.show();
        _this.setValue(0);
        if (maxValue > 0) {
            _this.showPopup();
        } else {
            _this.$sliderContainer.hide();
        }
    };
    this.registerTime = function(time) {
        if ($.inArray(time, _this.valuesTimes) === -1) {
            // not in valuesTimes
            _this.valuesTimes.push(time);
            _this.valuesTimes.sort();
        }
    };
    this.onSlide = function(event) {
        var text = map.getHourlySliderTooltip(_this.valuesTimes[event.value]);
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
        _this.setInfoBox(map.getHourlySliderTooltip(_this.valuesTimes[value]));
        map.onHourlySliderSlide(_this.valuesTimes[value]);
    };
    this.setValueByLaunchtime = function(launchtime) {
        _this.setValue($.inArray(launchtime, _this.valuesTimes));
    };
    this.getValue = function(value) {
        return _this.value;
    };

    return this;
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
        _this.set(100);
        _this.isAnimated = true;
    };
    this.makeStatic = function() {
        _this.$element.removeClass('progress-striped active');
        _this.isAnimated = false;
    };
    this.set = function(perc) {
        _this.$bar.css('width', perc + '%');
    };
    this.hide = function() {
        _this.$wrapper.hide();
    };
    return this;
}

var services = {
    geolocation: {
        getIPPosition: function(callback) {
            $.get('http://freegeoip.net/json/', null, function(data) {
                if (isNumber(data.latitude) && isNumber(data.longitude)) {
                    callback(new google.maps.LatLng(data.latitude, data.longitude));
                }
            }).fail(function() {
                console.log('IP Geolocation position failed');
                callback(null);
            });
        },
        gpsGeolocation: navigator.geolocation,
        getGPSPosition: function(callback) {
            navigator.geolocation.getCurrentPosition(callback);
        }
    },
    // prepare elevation service
    elevator: new google.maps.ElevationService()
};
