$(function(){
	var map = new google.maps.Map(document.getElementById("map-container"), {
		zoom: 8,
		center: new google.maps.LatLng(52.0, 0)
	});

	$("#sidebar-toggle").click(function(){
		var sidebar = $(".sidebar");
		if(sidebar.css("left")!="0px")
			sidebar.css("left", "0px");
		else
			sidebar.css("left", "-330px");
	})

	$('.unit-selection .dropdown-menu li a').click(function(event) {
            event.preventDefault();
            var $unit = $(this);
            var $unit_selection = $unit.closest('.unit-selection');
            $unit_selection.find('.unit-current').html($unit.html());
            $unit_selection.find('input[type="hidden"]').val($unit.html());
            $unit_selection.click();
            return false;
        });

	$("#inputLaunchDate").datetimepicker({
		timepicker:false,
		format:"Y/m/d"
	});

	$("#inputLaunchStartTime").datetimepicker({
		datepicker:false,
		format:"H:i"
	});
	$("#inputLaunchEndTime").datetimepicker({
		datepicker:false,
		format:"H:i"
	});

});