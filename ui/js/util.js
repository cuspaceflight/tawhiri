function nearestMinute(date, minutes) {
    if (minutes === null) {
        minutes = 1;
    }
    var coeff = 1000 * 60 * minutes;
    return new Date(Math.round(date.getTime() / coeff) * coeff);
}
function ceilMinute(date, minutes) {
    if (minutes === null) {
        minutes = 1;
    }
    var coeff = 1000 * 60 * minutes;
    return new Date(Math.ceil(date.getTime() / coeff) * coeff);
}
function floorMinute(date, minutes) {
    if (minutes === null) {
        minutes = 1;
    }
    var coeff = 1000 * 60 * minutes;
    return new Date(Math.floor(date.getTime() / coeff) * coeff);
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
    return 0.3048 * feet; // 1 meter == 0.3048 ft
}

