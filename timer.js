/***************** GLOBALS ***********************/

// boolean status vars:
//  working: are we working yet?  you can't turn this off once on.
//  onBreak: are we currently on a break? (duh)
var Status = {};

// offsets for audio and break time:
//  audio_s: the seconds of audio completed at Times.start
//  break_s: the seconds of unused break time accumulated at Times.start
// I'd prefer to just use e.g. "break", but it's reserved :(
var Offsets = {};

// based on the text inputs:
//  length: the length of the audio file
//  audioRatio: the ratio of audio time to time spent working
//  breakRatio: the ratio of break time given for audio time
var Settings = {};

// various Date objects:
//  now: the time at the beginning of this tick (for consistency)
//  start: the start of this segment of work or break
var Times = {};

// simple regular expression for time strings
var timeRegexp = /^[0-9:]+$/;

/***************** HELPER FUNCTIONS **************/

// turns a time string into a number of seconds
function parseTime(t) {
    var hrs, mins, secs;
    
    // if it's just a number, assume it's minutes
    if (t.indexOf(":") === -1) {
        return 60 * parseInt(t, 10);
    }
    else if (t.split(":").length === 2) {
        mins = parseInt(t.split(":")[0], 10);
        secs = parseInt(t.split(":")[1], 10);
        return (mins * 60) + secs;
    }
    // if it's more than two parts, just use the first three
    else {
        hrs  = parseInt(t.split(":")[0], 10);
        mins = parseInt(t.split(":")[1], 10);
        secs = parseInt(t.split(":")[2], 10);
        return (hrs * 3600) + (mins * 60) + secs;
    }
}

// turns number of seconds into a string representation (MMM:SS)
function secondsFormat(s) {
    var sign, mins, secs;
    
    sign = (s >= 0) ? "" : "-";
    secs = Math.abs(Math.floor(s));
    mins = Math.floor(secs / 60);
    secs -= mins * 60;
    
    mins = (mins < 10) ? "0" + mins : mins;
    secs = (secs < 10) ? "0" + secs : secs;
    return sign + mins + ":" + secs;
}

// turns a Date into a string representation (HH:MM:SS)
function timeFormat(date) {
    var hrs, mins, secs;
    
    hrs = date.getHours();
    mins = date.getMinutes();
    secs = date.getSeconds();
    hrs  = (hrs  > 12) ? (hrs - 12) : (hrs === 0) ? 12 : hrs;
    
    mins = (mins < 10) ? "0" + mins : mins;
    secs = (secs < 10) ? "0" + secs : secs;
    return hrs + ":" + mins + ":" + secs;
}

// returns "am" or "pm" based on the given Date
function ampm(date) {
    return (date.getHours() >= 12) ? "pm" : "am";
}

// reads form values into Settings global
function readFormValues() {
    var audioTarget, realTarget, realBreak, audioBreak;
    
    Settings.length = parseTime($("#input_filelength").val());
    
    audioTarget = parseFloat($("#input_audiotarget").val());
    realTarget  = parseFloat($("#input_realtarget").val());
    Settings.audioRatio = audioTarget / realTarget;
    
    realBreak  = parseFloat($("#input_realbreak").val());
    audioBreak = parseFloat($("#input_audiobreak").val());
    Settings.breakRatio = realBreak / audioBreak;
}

// returns the number of seconds from Date d2 to d1.
function timeDiff(d1, d2) {
    return (d1.getTime() - d2.getTime()) / 1000;
}

// returns the number of milliseconds of work left, based on globals
function remainingTime() {
    var workTime, breakTime;
    
    workTime  = (Settings.length - Offsets.audio_s) / Settings.audioRatio;
    breakTime = (Settings.length - Offsets.audio_s) * Settings.breakRatio;
    breakTime += Offsets.break_s; // break time already earned and unused
    return (workTime + breakTime) * 1000;
}

// updates the Target Time field with a new estimate, based on globals
function updateTargetTime() {
    var target = new Date(Times.start.getTime() + remainingTime());
    $("#display_targettime").html(timeFormat(target) + " " + ampm(target));    
}

// updates the audio and break offsets and resets Times.start
function updateOffsets() {
    if (Status.onBreak) {
        return;
    }
    var workDone = timeDiff(Times.now, Times.start) * Settings.audioRatio;
    Offsets.audio_s += workDone;
    Offsets.break_s += workDone * Settings.breakRatio;
    Times.start = Times.now;
}

/***************** EVENT HANDLERS ****************/

// initialize all the globals and then start the clock
function startWork() {
    // unless the file length resembles a valid time, screw it
    if (!($("#input_filelength").val().match(timeRegexp))) {
        return;
    }
        
    // grab the user input, just in case it somehow hasn't been read
    readFormValues();
    Offsets.audio_s = Offsets.break_s = 0;
    Times.start = Times.now; 

    // update the stuff displayed below the main clock section
    $("#input_breakbox").attr("checked", false);
    $("#input_newtime").val("");
    $("#display_starttime").html(timeFormat(Times.start) + " " + ampm(Times.start));
    $("#input_start").html("restart");
    updateTargetTime();
    
    Status.working = true;
    Status.onBreak = false;
}

// deal with a change to the "on break" status
function changeBreakStatus() {
    if (!Status.working) {
        return;
    }
    if ($('#input_breakbox').attr('checked')) {
        updateOffsets();
        Status.onBreak = true;
    }
    else {
        Offsets.break_s -= timeDiff(Times.now, Times.start);
        Times.start = Times.now;
        Status.onBreak = false;
    }
}

// deal with a change to the user-specified settings
function formChange() {
    if (!Status.working) {
        return;
    }
    updateOffsets();
    readFormValues();
    updateTargetTime();
}

// deal with an update to the current audio time
function updateTime() {
    // abort if the new time isn't valid
    if (!($("#input_newtime").val().match(timeRegexp))) {
        return;
    }
    var workDone, newOffset;

    // we'll do the offset stuff here instead of calling updateOffsets,
    // just because the specifics are different enough that it doesn't seem
    // worth trying to factor out.
    workDone = timeDiff(Times.now, Times.start) * Settings.audioRatio;
    newOffset = parseTime($("#input_newtime").val());
    Offsets.break_s += (newOffset - Offsets.audio_s) * Settings.breakRatio;
    Offsets.audio_s = newOffset;
    Times.start = Times.now;
    
    updateTargetTime();
    $("#input_newtime").val("");
}

/***************** MAIN FUNCTIONS ****************/

// update everything as necessary on every tick
function clockLoop() {
    var workDone, breakTime, breakSpent;
    
    Times.now = new Date(); // ensure that all math uses a consistent time
    $("#display_currenttime").html(timeFormat(Times.now));
    $("#display_ampm").html(ampm(Times.now));
    
    if (Status.working && !Status.onBreak) {
        workDone = timeDiff(Times.now, Times.start) * Settings.audioRatio;
        breakTime = workDone * Settings.breakRatio;
        $("#display_audiotime").html(secondsFormat(workDone + Offsets.audio_s));
        document.title = secondsFormat(workDone + Offsets.audio_s) + " (audio)";
        $("#display_breaktime").html(secondsFormat(breakTime + Offsets.break_s));
    }
    
    if (Status.working && Status.onBreak) {
        breakSpent = timeDiff(Times.now, Times.start);
        $("#display_breaktime").html(secondsFormat(Offsets.break_s - breakSpent));
        document.title = secondsFormat(Offsets.break_s - breakSpent) + " (break)";
    }
}

$(function () {
    setInterval(clockLoop, 100);
    setTimeout(function () {
        $("#display_currenttime").css("visibility", "visible");
        $("#display_ampm").css("visibility", "visible");
    }, 100);
    
    $(".box50, .box75").val("");
    
    $("#input_update").bind("click", updateTime);
    $(".box25, .box50").bind("blur", formChange);
    $("#input_start").bind("click", startWork);
    $("#input_breakbox").bind("click", changeBreakStatus);
});
