
function Request() {
    this.base_url = 'http://predict.habhub.org/';
    this.statusPollInterval = 500; //ms
    this.statusCheckTimeout = 5000; //ms

    var parent = this;

    this.pollForFinishedStatus = function(CSVParseCallback) {
        this.shouldKeepPollingStatus = true;
        this.hasFinished = false;
        this.setStatusCheck(CSVParseCallback);
    };


    this.submitForm = function(CSVParseCallback, args, data) {
        CSVParseCallback = {
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
                console.log(xhr);
            },
            success: function(data) {
                //console.log(data);
                if (data.valid == 'false') {
                    console.log('Error submitting prediction form, false data.valid');
                } else if (data.valid == 'true') {
                    parent.uuid = data.uuid;
                    console.log('Prediction form submitted with uuid ' + parent.uuid);
                    parent.isBackendWorking = true;
                    parent.pollForFinishedStatus(CSVParseCallback);
                } else {
                    console.log('Error submitting prediction form, invalid data.valid');
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
                    console.log('Status update failed, timeout (>5s)');
                }
            },
            success: function(data) {
                if (data.pred_complete == false) {
                    if (data.pred_running == false) {
                        console.log('Error: predictor not finished but not running');
                        return;
                    }
                    parent.setStatusCheck(CSVParseCallback);
                } else if (data.pred_complete == true) {
                    parent.hasFinished = true;
                    parent.getCSVData(CSVParseCallback);
                } else {
                    console.log('Error: predictor status invalid');
                    hasFinished = 'error';
                }
            }
        });
    };

    this.getCSVData = function(CSVParseCallback) {
        $.get(parent.base_url + 'ajax.php', {'action': 'getCSV', 'uuid': parent.uuid}, function(data) {
            if (data != null) {
                console.log('Got CSV data from server');
                if (CSVParseCallback.func(data, CSVParseCallback.args)) {
                    console.log('Finished parsing CSV data');
                } else {
                    console.log('Error: Parsing CSV data failed');
                }
            } else {
                console.log('Error: no CSV data actually returned');
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
    this.hourlyPredictionHours = 5;
    this.hourlyPrediction = false;
    this.hourlyPredictionTimes = [];
    // initialisation code
    this.mapOptions = {
        center: new google.maps.LatLng(52.2135, 0.0964),
        zoom: 10,
        mapTypeId: google.maps.MapTypeId.TERRAIN
    };
    this.map = new google.maps.Map(document.getElementById("map-canvas"),
            this.mapOptions);
    google.maps.event.addListener(this.map, 'rightclick', function(event) {
        console.log("Right click event", event);
        parent.setLaunch(event);
    });
    // end init code

    this.setLaunch = function(event) {
        console.log('Setting launch position and marker')
        this.setLaunchPosition(event.latLng);
        this.placeMarker(event.latLng);
    };

    this.setLaunchPosition = function(latLng) {
        // set the lat long values
        //console.log(latLng);
        $('#inputLaunchLat').val(latLng.b);
        $('#inputLaunchLong').val(latLng.d);
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
                    alert("No results found");
                }
            } else {
                alert("Elevation service failed due to: " + status);
            }
        });
    };

    this.removeAllPaths = function() {
        console.log('deleting all previous paths');
        $.each(this.paths, function(key, val) {
            for (var j = 0; j < parent.paths[key].pathCollection.length; j++) {
                parent.paths[key].pathCollection[j].setMap(null);
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
            title: 'Landing position'
        });
        pathCollection.push(marker);
        var marker = new google.maps.Marker({
            position: burst_latlng,
            icon: MapObjects.burstCircle,
            map: parent.map,
            title: 'Burst position'
        });
        pathCollection.push(marker);
        parent.paths[launchTime].pathCollection = pathCollection;
        return true;
    };

    this.plotPath = function(formData, launchTime) {
        console.log("plotting path");
        // thin black line
        var polyOptions = {
            strokeColor: '#000000',
            strokeOpacity: 1.0,
            strokeWeight: 2,
            zIndex: 10
        };
        var poly = new google.maps.Polyline(polyOptions);
        poly.setMap(this.map);
        // thick transparent line
        var polywOptions = {
            strokeColor: '#000000',
            strokeOpacity: 0.3,
            strokeWeight: 8,
            zIndex: 20
        };
        var polyw = new google.maps.Polyline(polywOptions);
        polyw.setMap(this.map);
        var pathw = polyw.getPath();
        //google.maps.event.addListener(polyw, 'mouseout', function() {
        //alert("mouseout");
        //});

        var args = {
            poly: poly,
            polyw: polyw
        };

        this.paths[launchTime] = args;

        request = new Request();
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
        return parent.hourlyPredictionTimes[value].toUTCString();
    };

    this.dimAllPaths = function() {
        $.each(this.paths, function(key, val) {
            for (var j = 0; j < parent.paths[key].pathCollection.length; j++) {
                parent.paths[key].pathCollection[j].setVisible(false);
            }
            parent.paths[key].poly.setOptions({visible: true, strokeOpacity: 0.1});
            parent.paths[key].polyw.setOptions({visible: true, strokeOpacity: 0.1});
        });
    };

    this.unDimPath = function(path) {
        for (var j = 0; j < path.pathCollection.length; j++) {
            path.pathCollection[j].setVisible(true);
        }
        path.poly.setOptions({strokeOpacity: 1.0});
        path.polyw.setOptions({strokeOpacity: 0.3});
    };

    this.onHourlySliderSlide = function(event) {
        //console.log(event);
        var value = event.value;
        console.log('dimming all paths');
        parent.dimAllPaths();
        console.log('undimming selected path');
        parent.unDimPath(parent.paths[parent.hourlyPredictionTimes[value]]);
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

function autoPopulateInputs() {
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
    map.removeAllPaths();
    var formData = getFormObj('#prediction-form');
    console.log(formData);
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
        map.plotPath($('#prediction-form').serialize(), runTime);
    } else {
        // is an hourly prediction
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
            map.hourlyPrediction = true;
            map.hourlyPredictionTimes.push(d);
            map.plotPath($.param(predictionData), d);
        }
        initHourlySlider(map.hourlyPredictionHours - 1);
    }
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
}

function hideHourlySlider() {
    $('#hourly-time-slider-container').html('<div id="hourly-time-slider"></div>');
}

//google.maps.event.addDomListener(window, 'load', initialize);

var elevator;
var map;

$(function() {
    elevator = new google.maps.ElevationService();
    map = new Map();
    autoPopulateInputs();
    $('#prediction-form').submit(function(event) {
        event.preventDefault();
        predict();
    });

    //$('#prediction-form').submit();
});