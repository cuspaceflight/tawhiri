
var map;
var elevator;
var markers = [];
var pathPointInfoWindows = [];
var timeoutPathPoints;
var poly;
var polyw;
var path;
var pathw;
var upArrow;
var downArrow;
var landCirlce;
var burstCircle;
function initialize() {
    var mapOptions = {
        center: new google.maps.LatLng(52.2135, 0.0964),
        zoom: 10,
        mapTypeId: google.maps.MapTypeId.TERRAIN
    };
    map = new google.maps.Map(document.getElementById("map-canvas"),
            mapOptions);
    google.maps.event.addListener(map, 'rightclick', handleRightClick);
    //predict();
}

function handleRightClick(event) {
    console.log("Right click event", event);
    setLaunchPosition(event.latLng);
    placeMarker(event.latLng);
}

function placeMarker(latLng) {
    removeAllMarkers();
    var marker = new google.maps.Marker({
        position: latLng,
        map: map,
        title: 'Launch Position (Lat: ' + latLng.lb + ', Long: ' + latLng.mb + ')'
    });
    markers.push(marker);
}

function removeAllMarkers() {
    for (var i = 0; i < markers.length; i++) {
        markers[i].setMap(null);
    }

}

function setLaunchPosition(latLng) {
// set the lat long values
//console.log(latLng);
    $('#inputLaunchLat').val(latLng.b);
    $('#inputLaunchLong').val(latLng.d);
    // get and set the altitude
    var locations = [latLng];
    var positionalRequest = {
        'locations': locations
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
}

function displayInfoBox(html) {
    $('#info-box').html(html);
}

function closeAllPathPointInfoWindows() {
    $.each(pathPointInfoWindows, function(key, val) {
        val.close();
    });
}

function plotPathInfoPoint(latlng, text) {
    var circleOptions = {
        strokeColor: '#FF0000',
        strokeOpacity: 0,
        strokeWeight: 8,
        fillColor: '#FF0000',
        fillOpacity: 0,
        map: map,
        center: latlng,
        radius: 8,
        zIndex: 100
    };
    // Add the circle for this city to the map.
    var infoPoint = new google.maps.Circle(circleOptions);
    var infowindow = new google.maps.InfoWindow({
        content: text,
        position: latlng
    });
    google.maps.event.addListener(infoPoint, 'mouseover', function() {
        // show point details
        //displayInfoBox(text);
        clearTimeout(timeoutPathPoints);
        closeAllPathPointInfoWindows();
        infowindow.open(map);
        pathPointInfoWindows.push(infowindow);
    });
    google.maps.event.addListener(infoPoint, 'mouseout', function() {
        //infowindow.close();
        timeoutPathPoints = setTimeout(function() {
            closeAllPathPointInfoWindows();
        }, 3000);
    });
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
function Request() {
    this.base_url = 'http://predict.habhub.org/';
    this.statusPollInterval = 500; //ms
    this.statusCheckTimeout = 5000; //ms

    var parent = this;


    this.pollForFinishedStatus = function() {
        this.shouldKeepPollingStatus = true;
        this.hasFinished = false;
        this.setStatusCheck();
    };


    this.submitForm = function(data) {
        console.log($("#prediction-form").serialize());

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
                console.log(data);
                if (data.valid == 'false') {
                    console.log('Error submitting prediction form, false data.valid');
                } else if (data.valid == 'true') {
                    parent.uuid = data.uuid;
                    console.log('Prediction form submitted with uuid ' + parent.uuid);
                    parent.isBackendWorking = true;
                    parent.pollForFinishedStatus();
                } else {
                    console.log('Error submitting prediction form, invalid data.valid');
                }
            }
        });
    };
    this.setStatusCheck = function() {
        window.setTimeout(parent.checkStatus, parent.statusPollInterval);
    };
    this.checkStatus = function() {
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
                    parent.setStatusCheck();
                } else if (data.pred_complete == true) {
                    parent.hasFinished = true;
                    parent.getCSVData();
                } else {
                    console.log('Error: predictor status invalid');
                    hasFinished = 'error';
                }
            }
        });
    };

    this.getCSVData = function() {
        $.get(parent.base_url + 'ajax.php', {'action': 'getCSV', 'uuid': parent.uuid}, function(data) {
            if (data != null) {
                console.log('Got CSV data from server');
                parent.CSVData = data;
                if (parent.parseCSVData()) {
                    console.log('Finished parsing CSV data');
                } else {
                    console.log('Error: Parsing CSV data failed');
                }
            } else {
                console.log('Error: no CSV data actually returned');
            }
        }, 'json');
    };

    this.parseCSVData = function() {
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
        $.each(parent.CSVData, function(key, val) {
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
                var infostr = '<span class="pathInfoPoint">' + formatTime(time) + "; Lat: " + lat + ", Long: " + lng + ", Alt: " + alt + "m</span>";
                plotPathInfoPoint(latlng, infostr);
                //console.log(infostr);

                if (key == 0) {
                    // launch position
                    var marker = new google.maps.Marker({
                        position: latlng,
                        icon: upArrow,
                        map: map,
                        title: 'Launch position'
                    });
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
            icon: landCircle,
            map: map,
            title: 'Landing position'
        });
        var marker = new google.maps.Marker({
            position: burst_latlng,
            icon: burstCircle,
            map: map,
            title: 'Burst position'
        });
        return true;
    };
}

function plotPath() {
    console.log("Getting path data");
    // thin black line
    var polyOptions = {
        strokeColor: '#000000',
        strokeOpacity: 1.0,
        strokeWeight: 2,
        zIndex: 10
    };
    poly = new google.maps.Polyline(polyOptions);
    poly.setMap(map);
    path = poly.getPath();
    // thick transparent line
    var polywOptions = {
        strokeColor: '#000000',
        strokeOpacity: 0.3,
        strokeWeight: 8,
        zIndex: 20
    };
    polyw = new google.maps.Polyline(polywOptions);
    polyw.setMap(map);
    pathw = polyw.getPath();
    google.maps.event.addListener(polyw, 'mouseout', function() {
        //alert("mouseout");
    });
    // svg symbols
    upArrow = {
        path: google.maps.SymbolPath.FORWARD_CLOSED_ARROW,
        fillColor: 'green',
        fillOpacity: 0,
        scale: 4,
        strokeColor: 'green',
        strokeWeight: 2
    };
    downArrow = {
        path: google.maps.SymbolPath.BACKWARD_CLOSED_ARROW,
        fillColor: 'red',
        fillOpacity: 0,
        scale: 4,
        strokeColor: 'red',
        strokeWeight: 2
    };
    burstCircle = {
        path: google.maps.SymbolPath.CIRCLE,
        fillColor: 'orange',
        fillOpacity: 0,
        scale: 6,
        strokeColor: 'orange',
        strokeWeight: 2
    };
    landCircle = {
        path: google.maps.SymbolPath.CIRCLE,
        fillColor: 'red',
        fillOpacity: 0,
        scale: 6,
        strokeColor: 'red',
        strokeWeight: 2
    };

    request = new Request();
    request.submitForm(
            'launchsite=Churchill&second=0&submit=Run+Prediction&lat=52.109878940354896&lon=-0.38898468017578125&initial_alt=28&day=14&month=1&year=2014&hour=21&min=59&ascent=5&burst=3000&drag=5 '
            );
    return false;

}





function predict() {/*
 poly.setMap(null);
 polyw.setMap(null);
 removeAllMarkers();
 closeAllPathPointInfoWindows();*/

    data = plotPath();
    //alert('here');
    return false;
}

function autoPopulateInputs() {
// date time
    var d = new Date();
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

$(function() {
    autoPopulateInputs();
});

google.maps.event.addDomListener(window, 'load', initialize);

elevator = new google.maps.ElevationService();


$(function() {
    $('#prediction-form').submit();
});