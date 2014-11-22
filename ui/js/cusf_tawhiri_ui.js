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

$(function() {
    map = new Map($('#map-wrap'));
    form = new Form($('#form-wrap'));
    notifications = new Notifications($('#notification-area'));
});
