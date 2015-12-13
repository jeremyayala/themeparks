var DisneyRequest = require("./disneyRequest");
var moment = require("moment-timezone");

/** Class to hold park-specific API calls for ease of access
 * Setup with a park ID and a DisneyRequest object
 * eg. new DisneyPark("80007944", new DisneyRequest());
 */
function DisneyPark(options, DRequest) {
  var config = {
    wdw_park_id: null,
    // default timezone (Florida time)
    timezone: "America/New_York",
    // time format to return dates in (see momentjs doc http://momentjs.com/docs/#/displaying/format/)
    //  default is ISO8601 format YYYY-MM-DDTHH:mm:ssZ
    timeFormat: "YYYY-MM-DDTHH:mm:ssZ",
    // format for printing days
    dateFormat: "YYYY-MM-DD",
    // request region (mostly for Disneyland Paris API, but may get rolled out elsewhere!)
    //  default to US (United States)
    apiRegion: "us",
    // do we need to make DLP-style requests?
    dlpMode: false,
  };

  this.TakeOptions = function(options) {
    // overwrite config with supplied options if they exist
    if (options) {
      for (var key in options) {
        config[key] = options[key];
      }
    }
  };
  this.TakeOptions(options);

  /** ===== Exports ===== */



  /** Get park waiting times for rides */
  this.GetWaitTimes = function(include_entertainment) {
    // callback is the last argument sent to the function
    var cb = arguments[arguments.length - 1];

    // include_entertainment defaults to false
    if (typeof include_entertainment == "function") include_entertainment = false;

    // fetch wait times from the API
    DRequest.GetPage(config.wdw_park_id, "theme-park", {
      subpage: config.dlpMode ? "" : "wait-times",
      apiopts: config.dlpMode ? "destination\u003ddlp/wait-times" : "",
    }, function(err, data) {
      if (err) return cb(err);

      // build ride array
      var rides = [];
      for (var i = 0; i < data.entries.length; i++) {
        var ride = data.entries[i];

        if (ride.id && ride.name && ride.type && ride.type == "Attraction") {
          // skip non attraction rides if we've not been told to include them
          if (!include_entertainment) {
            if (ride.type != "Attraction") continue;
          }

          var obj = {
            id: ride.id,
            name: ride.name
          };

          // try to find wait time value
          if (ride.waitTime && ride.waitTime && ride.waitTime.postedWaitMinutes) {
            // report the posted wait time if present
            obj.waitTime = ride.waitTime.postedWaitMinutes;
          } else {
            // zero if we cannot find a wait time
            obj.waitTime = 0;
          }

          // work out if the ride is active
          obj.active = (ride.waitTime && ride.waitTime.status == "Operating") ? true : false;

          // work out if we have fastpass
          obj.fastPass = (ride.waitTime.fastPass && ride.waitTime.fastPass.available);

          // add to our return rides array
          rides.push(obj);
        }
      }

      if (config.dlpMode) {
        // we have ride opening/closing times for DLP too, so add them if we can find them
        DRequest.GetDLPSchedule(function(err, data) {
          // ignore if we get an error
          if (err) return cb(null, rides);

          for (var i = 0, ride; ride = rides[i++];) {
            if (data[ride.id]) {
              // get today's date to find the correct opening times
              var today = moment().tz(config.timezone).format("YYYY-MM-DD");
              if (data[ride.id].times[today]) {
                for (var j = 0, time; time = data[ride.id].times[today][j++];) {
                  // look for "Operating" times (ignore any unusual times)
                  if (time.type == "Operating") {
                    rides[i - 1].openingTime = time.openingTime;
                    rides[i - 1].closingTime = time.closingTime;
                    break;
                  }
                }
              }
            }
          }

          // return rides with opening/closing times injected
          cb(null, rides);
        });
      } else {
        // return rides
        cb(null, rides);
      }
    });
  };

  /** Get park opening hours */
  this.GetSchedule = function(cb) {
    // DLP has a different way of fetching our schedule times
    if (config.dlpMode) {
      DRequest.GetDLPSchedule(function(err, data) {
        if (err) return cb(err);

        if (!data) return cb("No schedule data available");

        if (!data[config.wdw_park_id]) return cb("Unable to find park schedule data");

        var times = [];
        for (var date in data[config.wdw_park_id].times) {
          for (var i = 0, time; time = data[config.wdw_park_id].times[date][i++];) {
            times.push({
              date: moment(date).format(config.dateFormat),
              openingTime: time.openingTime,
              closingTime: time.closingTime,
              type: time.type,
            });
          }
        }
        return cb(null, times);
      });
    } else {
      // TODO - format this data nicely
      DRequest.GetPage(config.wdw_park_id, "schedule", function(err, data) {
        if (err) return cb(err);

        var times = [];
        // parse data into a nice format
        for (var i = 0; i < data.schedules.length; i++) {
          var o = {
            // format date as well as times
            date: moment(data.schedules[i].date).format(config.dateFormat),
            // format time to the timezone properly using momentjs
            openingTime: ParseTime(data.schedules[i].date + data.schedules[i].startTime),
            // add an extra day if the closing time is past midnight
            closingTime: ParseTime(data.schedules[i].date + data.schedules[i].endTime, (data.schedules[i].endTime[0] == "0") ? 1 : 0),
            // type, can be "Operating", "Extra Magic Hours" or "Special Ticketed Event"
            //  consider only using "Operating" or have special UI to handle any type of park hours
            type: data.schedules[i].type
          };

          times.push(o);
        }

        return cb(null, times);
      });
    }
  };

  // format of wdw API times
  var wdwTimeFormat = "YYYY-MM-DDHH:mm";

  function ParseTime(time, add_days) {
    var parsedTime = moment.tz(time, wdwTimeFormat, config.timezone);

    if (add_days) {
      parsedTime.add(add_days, "days");
    }

    return parsedTime.format(config.timeFormat);
  }


  /** ===== Variables ===== */



  // make sure we have a request object if it wasn't supplied
  if (!DRequest) DRequest = new DisneyRequest();
}

// export this module
module.exports = DisneyPark;