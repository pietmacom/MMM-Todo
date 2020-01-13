/* Magic Mirror
 * Node Helper: Calendar - CalendarFetcher
 *
 * By Michael Teeuw http://michaelteeuw.nl
 * MIT Licensed.
 */

var ical = require("./vendor/ical.js");
var moment = require("moment");

var CalendarFetcher = function(url, reloadInterval, excludedEvents, maximumEntries, maximumNumberOfDays, auth, includePastEvents) {
	var self = this;

	var reloadTimer = null;
	var events = [];

	var fetchFailedCallback = function() {};
	var eventsReceivedCallback = function() {};

	/* fetchCalendar()
	 * Initiates calendar fetch.
	 */
	var fetchCalendar = function() {

		clearTimeout(reloadTimer);
		reloadTimer = null;

		nodeVersion = Number(process.version.match(/^v(\d+\.\d+)/)[1]);
		var opts = {
			headers: {
				"User-Agent": "Mozilla/5.0 (Node.js "+ nodeVersion + ") MagicMirror/"  + global.version +  " (https://github.com/MichMich/MagicMirror/)"
			},
			gzip: true
		};

		if (auth) {
			if(auth.method === "bearer"){
				opts.auth = {
					bearer: auth.pass
				};

			} else {
				opts.auth = {
					user: auth.user,
					pass: auth.pass
				};

				if(auth.method === "digest"){
					opts.auth.sendImmediately = false;
				} else {
					opts.auth.sendImmediately = true;
				}
			}
		}

		ical.fromURL(url, opts, function(err, data) {
			if (err) {
				fetchFailedCallback(self, err);
				scheduleTimer();
				return;
			}

			// console.log(data);
			newEvents = [];

			// limitFunction doesn't do much limiting, see comment re: the dates array in rrule section below as to why we need to do the filtering ourselves
			var limitFunction = function(date, i) {return true;};

			var eventDate = function(event, time) {
				return (event[time].length === 8) ? moment(event[time], "YYYYMMDD") : moment(new Date(event[time]));
			};

			for (var e in data) {
				var event = data[e];
				if (event.type === "VTODO") {
					var status = event.status;
					var completion = event.completion;

					if(status == "COMPLETED" || completion >= 100) {
					    continue;
					}

					var title = getTitleFromEvent(event);
					var description = event.description || false;

					newEvents.push({
							title: title,
							class: event.class,
							description: description,
							});
				}
			}

			newEvents.sort(function(a, b) {
				return a.startDate - b.startDate;
			});

			//console.log(newEvents);

			events = newEvents.slice(0, maximumEntries);

			self.broadcastEvents();
			scheduleTimer();
		});
	};

	/* scheduleTimer()
	 * Schedule the timer for the next update.
	 */
	var scheduleTimer = function() {
		//console.log('Schedule update timer.');
		clearTimeout(reloadTimer);
		reloadTimer = setTimeout(function() {
			fetchCalendar();
		}, reloadInterval);
	};

	/* isFullDayEvent(event)
	 * Checks if an event is a fullday event.
	 *
	 * argument event object - The event object to check.
	 *
	 * return bool - The event is a fullday event.
	 */
	var isFullDayEvent = function(event) {
		if (event.start.length === 8 || event.start.dateOnly) {
			return true;
		}

		var start = event.start || 0;
		var startDate = new Date(start);
		var end = event.end || 0;
		if (((end - start) % (24 * 60 * 60 * 1000)) === 0 && startDate.getHours() === 0 && startDate.getMinutes() === 0) {
			// Is 24 hours, and starts on the middle of the night.
			return true;
		}

		return false;
	};

	/* timeFilterApplies()
	 * Determines if the user defined time filter should apply
	 *
	 * argument now Date - Date object using previously created object for consistency
	 * argument endDate Moment - Moment object representing the event end date
	 * argument filter string - The time to subtract from the end date to determine if an event should be shown
	 *
	 * return bool - The event should be filtered out
	 */
	var timeFilterApplies = function(now, endDate, filter) {
		if (filter) {
			var until = filter.split(" "),
				value = parseInt(until[0]),
				increment = until[1].slice("-1") === "s" ? until[1] : until[1] + "s", // Massage the data for moment js
				filterUntil = moment(endDate.format()).subtract(value, increment);

			return now < filterUntil.format("x");
		}

		return false;
	};

	/* getTitleFromEvent(event)
	* Gets the title from the event.
	*
	* argument event object - The event object to check.
	*
	* return string - The title of the event, or "Event" if no title is found.
	*/
	var getTitleFromEvent = function (event) {
		var title = "Event";
		if (event.summary) {
			title = (typeof event.summary.val !== "undefined") ? event.summary.val : event.summary;
		} else if (event.description) {
			title = event.description;
		}

		return title;
	};

	var testTitleByFilter = function (title, filter, useRegex, regexFlags) {
		if (useRegex) {
			// Assume if leading slash, there is also trailing slash
			if (filter[0] === "/") {
				// Strip leading and trailing slashes
				filter = filter.substr(1).slice(0, -1);
			}

			filter = new RegExp(filter, regexFlags);

			return filter.test(title);
		} else {
			return title.includes(filter);
		}
	};

	/* public methods */

	/* startFetch()
	 * Initiate fetchCalendar();
	 */
	this.startFetch = function() {
		fetchCalendar();
	};

	/* broadcastItems()
	 * Broadcast the existing events.
	 */
	this.broadcastEvents = function() {
		//console.log('Broadcasting ' + events.length + ' events.');
		eventsReceivedCallback(self);
	};

	/* onReceive(callback)
	 * Sets the on success callback
	 *
	 * argument callback function - The on success callback.
	 */
	this.onReceive = function(callback) {
		eventsReceivedCallback = callback;
	};

	/* onError(callback)
	 * Sets the on error callback
	 *
	 * argument callback function - The on error callback.
	 */
	this.onError = function(callback) {
		fetchFailedCallback = callback;
	};

	/* url()
	 * Returns the url of this fetcher.
	 *
	 * return string - The url of this fetcher.
	 */
	this.url = function() {
		return url;
	};

	/* events()
	 * Returns current available events for this fetcher.
	 *
	 * return array - The current available events for this fetcher.
	 */
	this.events = function() {
		return events;
	};
};

module.exports = CalendarFetcher;
