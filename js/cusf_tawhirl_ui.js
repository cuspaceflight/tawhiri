
function Request() {
    this.base_url = 'http://predict.habhub.org/';
    this.statusPollInterval = 500; //ms
    this.statusCheckTimeout = 5000; //ms
    this.numberOfFails = 0;
    this.maxNumberOfFails = 5;
    this.status = 'running';
    this.numberOfReruns = 0;
    this.maxNumberOfReruns = 3;
    this.CSVParseCallback = null;
    this.args = null;
    this.data = null;

    var parent = this;

    this.rerun = function() {
        this.numberOfFails = 0;
        this.maxNumberOfFails = 10;
        this.status = 'running';

        this.submitForm(this.CSVParseCallback, this.args, this.data);
    };

    this.pollForFinishedStatus = function(CSVParseCallback) {
        this.shouldKeepPollingStatus = true;
        this.hasFinished = false;
        this.setStatusCheck(CSVParseCallback);
    };


    this.submitForm = function(CSVParseCallback, args, data) {
        this.CSVParseCallback = CSVParseCallback;
        this.args = args;
        this.data = data;
        var CSVParseCallbackInfo = {
            func: CSVParseCallback,
            args: args
        };
        //console.log($("#prediction-form").serialize());

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
                if (data.valid == 'false') {
                    infoAlert('Error submitting prediction form, some of the submitted data appeared invalid <br/>' + data.error);
                    parent.status = 'failed';
                } else if (data.valid == 'true') {
                    parent.uuid = data.uuid;
                    console.log('Prediction form submitted with uuid ' + parent.uuid);
                    parent.isBackendWorking = true;
                    parent.pollForFinishedStatus(CSVParseCallbackInfo);
                } else {
                    console.log('Error submitting prediction form, invalid data.valid');
                    parent.status = 'failed, should rerun';
                }
            }
        });
    };

    this.setStatusCheck = function(CSVParseCallback) {
        window.setTimeout(function() {
            parent.checkStatus(CSVParseCallback);
        }, parent.statusPollInterval);
    };

    this.checkStatus = function(CSVParseCallback) {
        var hasFinished = false;
        $.ajax({
            url: parent.base_url + 'preds/' + parent.uuid + '/progress.json',
            cache: false,
            dataType: 'json',
            timeout: parent.statusCheckTimeout,
            error: function(xhr, status, error) {
                if (status == 'timeout') {
                    if (parent.numberOfFails <= parent.maxNumberOfFails) {
                        parent.numberOfFails++;
                        console.log('Status update failed, timeout (>5s). trying again', 'info', 'info');
                        parent.setStatusCheck(CSVParseCallback);
                    } else {
                        console.log('Status update failed, maximum number of attempts reached. Aborting.');
                        parent.status = 'failed, should rerun';
                    }
                } else {
                    //alert(status);
                    if (parent.numberOfFails <= parent.maxNumberOfFails) {
                        parent.numberOfFails++;
                        console.log('Status update failed. trying again; ' + status + '; ' + error, 'info', 'info');
                        parent.setStatusCheck(CSVParseCallback);
                    } else {
                        console.log('Status update failed, maximum number of attempts reached. Aborting.');
                        parent.status = 'failed, should rerun';
                    }
                }
            },
            success: function(data) {
                if (data.pred_complete == false) {
                    if (data.pred_running == false) {
                        console.log('Error: predictor not finished but not running');
                        parent.status = 'failed, should rerun';
                        return;
                    }
                    parent.setStatusCheck(CSVParseCallback);
                } else if (data.pred_complete == true) {
                    parent.getCSVData(CSVParseCallback);
                } else {
                    console.log('Error: predictor status invalid');
                    parent.status = 'failed, should rerun';
                }
            }
        });
    };

    this.getCSVData = function(CSVParseCallback) {
        $.get(parent.base_url + 'ajax.php', {action: 'getCSV', uuid: parent.uuid}, function(data) {
            if (data != null) {
                //console.log('Got CSV data from server');
                if (CSVParseCallback.func(data, CSVParseCallback.args)) {
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
    this.hourlyPredictionHours = 50;
    this.hourlyPrediction = false;
    this.hourlyPredictionTimes = [];
    this.mapBounds = [];
    this.responsesReceived = 0;
    this.totalResponsesExpected = 1;
    this.willNotComplete = false;
    this.shouldCheckForCompletion = true;
    this.runningRequests = [];
    this.currentHourlySliderValue = null;
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
    });
    // end init code

    this.reset = function() {
        this.removeAllPaths();
        this.clearMapBounds();

        this.responsesReceived = 0;
        this.totalResponsesExpected = 1;
        this.willNotComplete = false;
        this.shouldCheckForCompletion = true;
        this.runningRequests = [];
        this.currentHourlySliderValue = null;
    };

    this.listenForNextLeftClick = function() {
        google.maps.event.addListener(parent.map, 'click', function(event) {
            parent.stopListeningForLeftClick();
            console.log("Left click event", event);
            parent.setLaunch(event);
        });
    };
    this.stopListeningForLeftClick = function() {
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
        console.log('Setting launch position and marker')
        this.setLaunchPosition(event.latLng);
        this.placeMarker(event.latLng);
    };

    this.setLaunchPosition = function(latLng) {
        // set the lat long values
        //console.log(latLng);
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
                } else {
                    infoAlert("No elevation results found");
                }
            } else {
                infoAlert("Elevation service failed due to: " + status);
            }
        });
    };

    this.removeAllPaths = function() {
        console.log('deleting all previous paths');
        $.each(this.paths, function(key, val) {
            if (parent.paths[key].pathCollection) {
                for (var j = 0; j < parent.paths[key].pathCollection.length; j++) {
                    parent.paths[key].pathCollection[j].setMap(null);
                }
            }
        });
        this.paths = {};
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

        var items = [];
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
            if (results.length == 4) {
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

                if (key == 0) {
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
        var pathw = polyw.getPath();
        google.maps.event.addListener(polyw, 'click', function(event) {
            setHourlySlider($.inArray(launchTime, parent.hourlyPredictionTimes));
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
            if (parent.paths[key].pathCollection) {
                for (var j = 0; j < parent.paths[key].pathCollection.length; j++) {
                    parent.paths[key].pathCollection[j].setVisible(false);
                }
            }
            parent.paths[key].poly.setOptions({
                visible: true,
                strokeOpacity: 0.1,
                strokeColor: '#000000',
                zIndex: 20
            });
            parent.paths[key].polyw.setOptions({
                visible: true,
                strokeOpacity: 0.1,
                zIndex: 30
            });
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
        parent.dimAllPaths();
        parent.unDimPath(path);
    };

    this.onHourlySliderSlide = function(event) {
        //console.log(event);
        var value = event.value;
        if (value != parent.currentHourlySliderValue) {
            parent.currentHourlySliderValue = value;
            parent.selectPath(parent.paths[parent.hourlyPredictionTimes[value]]);
        }
    };

    this.checkForAllResponsesReceived = function() {
        parent.hasChangedProgressBar = false;
        parent.runningRequests = $.grep(parent.runningRequests, function(request, index) {
            console.log(request.status);
            if (request.status == 'success') {
                return false;
            } else if (request.status == 'running') {
                return true;
            } else if (request.status == 'failed, should rerun' && request.numberOfReruns <= request.maxNumberOfReruns) {
                console.log('Rerunning request:');
                console.log(request);
                request.numberOfReruns++;
                request.rerun();
                return true;
            } else {
                // either status is failed, or should rerun but max number
                // of reruns has been reached
                infoAlert('Request failed.');
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
                parent.centerMapToBounds();
                if (parent.hourlyPrediction) {
                    initHourlySlider(map.responsesReceived - 1);
                    setHourlySlider(0);
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

function padTwoDigits(x) {
    x = x + "";
    if (x.length == 1) {
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

function getFormObj(formId) {
    var formObj = {};
    var inputs = $(formId).serializeArray();
    $.each(inputs, function(i, input) {
        formObj[input.name] = input.value;
    });
    return formObj;
}

function predict() {
    closeAllInfoAlerts();
    hideHourlySlider();
    map.reset();
    showProgressBar();
    makeProgressBarAnimated();
    var formData = getFormObj('#prediction-form');
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
        map.plotPath($('#prediction-form').serialize(), runTime);
    } else {
        // is an hourly prediction
        map.hourlyPrediction = true;
        var i;
        for (i = 0; i < map.hourlyPredictionHours; i++) {
            var predictionData = jQuery.extend({}, formData);
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

function initHourlySlider(max) {
    $("#hourly-time-slider").slider({
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

    // show info popup
    $('#hourly-time-slider-container').popover('show');
    window.setTimeout(function() {
        $('#hourly-time-slider-container').popover('hide');
    }, 5000);
    $('#hourly-time-slider-container').mousedown(function(event) {
        $('#hourly-time-slider-container').popover('hide');
    });
}

function hideHourlySlider() {
    $('#hourly-time-slider-container').html('<div id="hourly-time-slider"></div>');
}

function setHourlySlider(value) {
    $("#hourly-time-slider").slider('setValue', value);
    map.onHourlySliderSlide({value: value});
}

function closeAllInfoAlerts() {
    $('#alert-area').html('');
    openAlerts = {};
}

function infoAlert(msg, title, type) {
    var alertData = $.param({msg: msg, title: title, type: type});

    if (alertData in openAlerts) {
        $('#' + openAlerts[alertData]).remove();
    }

    var d = new Date();
    var id = 'alert-' + d.getTime();
    $('#alert-area').append('<div id="' + id + '" class="alert alert-' + (type || 'danger') + ' alert-dismissable">' +
            '<button type="button" class="close" data-dismiss="alert" aria-hidden="true">&times;</button>' +
            '<strong>' + (title || 'Error') + '</strong> ' + msg +
            '</div>');
    $('#' + id).hide().slideDown('slow');
    // add alert close hook
    $('#' + id).bind('close.bs.alert', function() {
        // remove from global openAlerts array
        openAlerts = $.grep(openAlerts, function(value) {
            return value != alertData;
        });
    });
    openAlerts[alertData] = id;

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


function Form() {
    this.isOpen = true;
    this.canBeHoveredOver = true;
    var parent = this;

    this.autoPopulateInputs = function() {
        // date time
        var currentTime = new Date();
        var d = new Date(currentTime.getTime() + 5 * 60000); // add 5 minutes into the future

        $('#inputLaunchDay').attr("value", d.getDate());
        $('#inputLaunchMonth option[value=' + d.getMonth() + ']').attr("selected", "selected");
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
            predict();
        });

        // setting position
        $('#btn-set-position').click(function(event) {
            map.listenForNextLeftClick();
        });

        //Enable swiping...
        $("#form-wrap .formToggleVisible-wrap").swipe({
            //Generic swipe handler for all directions
            swipe: function(event, direction, distance, duration, fingerCount) {
                if (fingerCount > 0) {
                    // prevent mouse problems
                    parent.onSwipe(direction);
                }
            },
            //Default is 75px, set to 0 for demo so any distance triggers swipe
            threshold: 5
        });

        //Clicking
        $("#form-wrap .formToggleVisible-wrap").mousedown(function(event) {
            console.log('mousedown');
            parent.toggle();
        });

        // hover
        $("#form-wrap .formToggleVisible-wrap").hover(function(event) {
            if (parent.canBeHoveredOver) {
                console.log('hover');
                parent.open();
            }
        });

    };
    this.onSwipe = function(direction) {
        if ((isMobile && direction == 'up') || (!isMobile && direction == 'left')) {
            parent.close();
        } else if ((isMobile && direction == 'down') || (!isMobile && direction == 'right')) {
            parent.open();
        }
    };
    this.open = function() {
        if (parent.isOpen) {
            return;
        }
        if (isMobile) {
            $("#form-wrap").animate({marginTop: 0});
        } else {
            $("#form-wrap").animate({marginLeft: 0});
        }
        parent.isOpen = true;
    };
    this.close = function() {
        if (!parent.isOpen) {
            return;
        }

        parent.canBeHoveredOver = false;
        window.setTimeout(function() {
            parent.canBeHoveredOver = true;
        }, 500);

        if (isMobile) {
            $("#form-wrap").animate({marginTop: -$("#form-wrap").outerHeight() + 'px'});
        } else {
            $("#form-wrap").animate({marginLeft: '-350px'});
        }
        parent.isOpen = false;
    };
    this.toggle = function() {
        if (parent.isOpen) {
            parent.close();
        } else {
            parent.open();
        }
    };

    // init code
    this.autoPopulateInputs();
    this.setUpEventHandling();
    // end init code
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

var openAlerts = {};
var elevator;
var map;
var form;
var isMobile = false;
$(function() {
    elevator = new google.maps.ElevationService();
    map = new Map();
    form = new Form();
    $(window).resize(onWindowSizeChange);
    onWindowSizeChange();

    $('#hourly-time-slider-container').popover({
        placement: 'left',
        trigger: 'manual',
        template: '<div class="popover hourlySliderInfoPopup"><div class="arrow"></div><h3 class="popover-title"></h3><div class="popover-content"></div></div>'
    });

    //infoAlert('hey');
    //window.setTimeout(function(){infoAlert('hey');}, 3000);
    //$('#prediction-form').submit();
});