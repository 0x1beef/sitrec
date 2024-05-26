import {gui, NodeMan, Sit} from "../Globals";
import {CNode} from "./CNode";
import {par} from "../par";
import {calculateGST} from "./CNodeDisplayNightSky";
import {isKeyCodeHeld, isKeyHeld} from "../KeyBoardHandler";
import {forceUpdateUIText} from "./CNodeViewUI";
import {assert} from "../utils";
import {addOptionToGUIMenu, removeOptionFromGUIMenu} from "../lil-gui-extras";
import {remove} from "../../three.js/examples/jsm/libs/tween.module";

const timeZoneOffsets = {
    "IDLW UTC-12": -12,     // International Date Line West
    "NT UTC-11": -11,       // Nome Time
    "HST UTC-10": -10,      // Hawaii Standard Time
    "HDT UTC-9": -9,        // Hawaii Daylight Time
    "AKST UTC-9": -9,       // Alaska Standard Time
    "AKDT UTC-8": -8,       // Alaska Daylight Time
    "PST UTC-8": -8,        // Pacific Standard Time
    "PDT UTC-7": -7,        // Pacific Daylight Time
    "MST UTC-7": -7,        // Mountain Standard Time
    "MDT UTC-6": -6,        // Mountain Daylight Time
    "CST UTC-6": -6,        // Central Standard Time
    "CDT UTC-5": -5,        // Central Daylight Time
    "EST UTC-5": -5,        // Eastern Standard Time
    "EDT UTC-4": -4,        // Eastern Daylight Time
    "AST UTC-4": -4,        // Atlantic Standard Time
    "ADT UTC-3": -3,        // Atlantic Daylight Time
    "FKST UTC-3": -3,       // Falkland Islands Summer Time
    "GST UTC-2": -2,        // South Georgia and the South Sandwich Islands
    "AZOT UTC-1": -1,       // Azores Standard Time
    "AZOST UTC+0": 0,       // Azores Summer Time
    "GMT UTC+0": 0,         // Greenwich Mean Time
    "BST UTC+1": 1,         // British Summer Time
    "CET UTC+1": 1,         // Central European Time
    "CEST UTC+2": 2,        // Central European Summer Time
    "EET UTC+2": 2,         // Eastern European Time
    "EEST UTC+3": 3,        // Eastern European Summer Time
    "MSK UTC+3": 3,         // Moscow Standard Time
    "SAMT UTC+4": 4,        // Samara Time
    "YEKT UTC+5": 5,        // Yekaterinburg Time
    "OMST UTC+6": 6,        // Omsk Standard Time
    "KRAT UTC+7": 7,        // Krasnoyarsk Time
    "IRKT UTC+8": 8,        // Irkutsk Time
    "YAKT UTC+9": 9,        // Yakutsk Time
    "VLAT UTC+10": 10,      // Vladivostok Time
    "AEST UTC+10": 10,      // Australian Eastern Standard Time
    "ACST UTC+9.5": 9.5,    // Australian Central Standard Time
    "ACDT UTC+10.5": 10.5,  // Australian Central Daylight Time
    "AWST UTC+8": 8,        // Australian Western Standard Time
    "NZST UTC+12": 12,      // New Zealand Standard Time
    "NZDT UTC+13": 13,      // New Zealand Daylight Time
    "MAGT UTC+11": 11,      // Magadan Time
    "PETT UTC+12": 12,      // Kamchatka Time
    "LHST UTC+10.5": 10.5,  // Lord Howe Standard Time
    "LHDT UTC+11": 11       // Lord Howe Daylight Time
};

// Create a new object where both keys and values are the keys from timeZoneOffsets
const timeZoneKeys = [];



for (const key in timeZoneOffsets) {
    if (timeZoneOffsets.hasOwnProperty(key)) {
        timeZoneKeys.push(key)
    }
}

// given a start time in ms, calculate the current "now" time based on the frame and the simSpeed and fps
function startToNowMS(startMS) {
    const nowMS = (Math.round(startMS + par.frame * 1000 * (Sit.simSpeed??1)/ Sit.fps))
    return nowMS;
}

// reverse of the above, given a "now" time, calculate the start time
function nowToStartMS(nowMS) {
    const startMS = (Math.round(nowMS - par.frame * 1000 * (Sit.simSpeed??1)/ Sit.fps))
    return startMS;
}

function startToNowDateTime(startDateTime) {
    // given a dateTime Object, convert to ms, then convert to now time
    // and then back to a dateTime object
    const start = startDateTime.valueOf();
    const now = startToNowMS(start);
    return new Date(now);
}

function nowToStartDateTime(nowDateTime) {
    // given a dateTime Object, convert to ms, then convert to start time
    // and then back to a dateTime object
    const now = nowDateTime.valueOf();
    const start = nowToStartMS(now);
    return new Date(start);
}

// A UI node for the Date and Time at the start of the video/sitch
// also updates the current time (nowDate) based on Sit settings.
// and calculates common intermediate values, like Greenwitch SideReal Time, and Julian Date
export class CNodeDateTime extends CNode {
    constructor(v) {

        console.log("CNodeDateTime - par.frame = "+par.frame+" Sit.fps = "+Sit.fps+" Sit.simSpeed = "+Sit.simSpeed+" Sit.startTime = "+Sit.startTime)

        super (v)

        
        this.refreshingUI = false;

        this.dateTimeFolder = gui.addFolder("Date/Time");

        this.dateTime = {
            // year: 2022,
            // month: 1,
            // day: 15,
            // hour: 12,
            // minute: 30,
            // second: 0,
            // millisecond: 0,
        }

        this.populateStartTimeFromUTCString(Sit.startTime);
        this.dateNow = startToNowDateTime(this.dateStart);

        // var for the menu to sync the time to the start time or the now time or a track
        // not currently used, but the UI needs the variable.
        this.syncMethod = null;
        this.addSyncSwitch();

        // test the start2now and now2start functions, ensure the go back and forth with no changes
        for (var i = 0; i < 100000; i++) {
            const start = this.dateNow.valueOf() + i;
            const now = startToNowMS(start);
            const start2 = nowToStartMS(now);
            assert(start === start2, "start2now now2start error at i = "+i+" start = "+start+" now = "+now+" start2 = "+start2);
        }


        this.dateTimeFolder.add(Sit, "startTime").listen()
        this.dateTimeFolder.add(Sit, "nowTime").listen()

      // The UI will update the dateNow member, and then we will update the dateStart member
        this.dateTimeFolder.add(this.dateTime, "year", 1947, 2030, 1).listen().onChange(v => this.updateDateTime(v))
        this.dateTimeFolder.add(this.dateTime, "month", 1, 12, 1).listen().onChange(v => this.updateDateTime(v))
        this.dateTimeFolder.add(this.dateTime, "day", 1, 31, 1).listen().onChange(v => this.updateDateTime(v))
        this.dateTimeFolder.add(this.dateTime, "hour", 0, 23, 1).listen().onChange(v => this.updateDateTime(v))
        this.dateTimeFolder.add(this.dateTime, "minute", 0, 59, 1).listen().onChange(v => this.updateDateTime(v))
        this.dateTimeFolder.add(this.dateTime, "second", 0, 59, 1).listen().onChange(v => this.updateDateTime(v))
        this.dateTimeFolder.add(this.dateTime, "millisecond", 0, 999, 1).listen().onChange(v => this.updateDateTime(v))

        const options = { timeZoneName: 'short' };
        const timeZone = new Date().toLocaleTimeString('en-us', options).split(' ')[2];

        this.timeZoneName = "PDT UTC-7";
        for (let tz of timeZoneKeys) {
            if (tz.startsWith(timeZone)) {
                this.timeZoneName = tz;
            }
        }

        this.dateTimeFolder.add(this, "timeZoneName", timeZoneKeys).name("Display Time Zone").listen().onChange(
            v => {
                console.log("Timezone "+v)
                forceUpdateUIText();
                par.renderOne = true;
            }
        )

        this.oldSimSpeed = Sit.simSpeed;

        this.dateTimeFolder.add(Sit, 'simSpeed', 1, 60, 0.01).name("Simulation Speed").listen().onChange(
            v => {
                // if the simSpeed changes, we need to update the start time
                // but we want the nowTime to remain the same, so we need to calculate
                // the new start time relative to that with the new simSpeed
                this.setNowDateTime(this.dateNow); // this will update the dateStart member
                this.recalculateCascade();
            }
        )

        this.dateTimeFolder.add(this, "resetStartTime").name("Reset Start Time");
        this.dateTimeFolder.add(this, "resetNowTimeToCurrent").name("Sync to Current Time");

        this.addedSyncToTrack = false;

        if (Sit.showDateTime) {
            this.dateTimeFolder.open();
        } else {
            this.dateTimeFolder.close();
        }

        this.update(0);

    }

    modSerialize() {
        return {
            startDateTime: this.getStartTimeString(),
            timeZoneName: this.timeZoneName,
            simSpeed: Sit.simSpeed
        }
    }

    modDeserialize(v) {
        this.populateStartTimeFromUTCString(v.startDateTime);
        this.timeZoneName = v.timeZoneName;
        Sit.simSpeed = v.simSpeed;
        this.populate();
        this.update(0);
    }


    get date() {
        assert(0, "CNodeDateTime - date is deprecated")
    }

    getTimeZoneName() {
        return this.timeZoneName;
    }

    getTimeZoneOffset() {
        return(timeZoneOffsets[this.timeZoneName])
    }

    // add a select node that has the start time
    addSyncSwitch() {

        this.syncSwitch = this.dateTimeFolder.add(this, "syncMethod", ["-","Start Time", "Now Time"]).name("Sync Time to")
            .onChange( v => {
                if (v === "-") {
                    // do nothing
                } else if (v === "Start Time") {
                    this.resetStartTime(); }
                else if (v === "Now Time") {
                    this.resetNowTimeToCurrent();
                } else {
                    // it the name of a track
                    console.log(v)
                    this.syncToTrack(v)
                }
                par.renderOne = true

                // reset it back to the default
                // so we can select the same thing again
                this.syncMethod = "-";
                this.syncSwitch.updateDisplay();


            }
        );
    }

    addSyncToTrack(timedTrack) {
        if (!this.addedSyncToTrack) {
          //  this.dateTimeFolder.add(this, "syncStartTimeTrack").name("Sync to "+timedTrack);

            removeOptionFromGUIMenu(this.syncSwitch, timedTrack);
            addOptionToGUIMenu(     this.syncSwitch, timedTrack, timedTrack)

        }
        this.syncTrack = timedTrack;
    }

    // meu callback funtion for the sync button (deprecated)
    syncStartTimeTrack() {
        this.syncToTrack(this.syncTrack)
    }

    // sync the start time to the start time of a track given by trackID
    syncToTrack(trackID) {
        par.frame = 0;
        const timedTrackNode = NodeMan.get(trackID);
        const startTime = timedTrackNode.getTrackStartTime();
        console.log(">>>"+startTime)

        this.setStartDateTime(new Date(startTime));

        // rebuild anything the depends on that track
        timedTrackNode.recalculateCascade(0);
    }

    setStartDateTime(dateTime) {
        this.dateStart = new Date(dateTime);
        this.dateNow = startToNowDateTime(this.dateStart);
        this.populate();
    }

    setNowDateTime(dateTime) {
        this.dateNow = new Date(dateTime);
        this.dateStart = nowToStartDateTime(this.dateNow);
        this.populate();
    }

    resetStartTime() {
        this.setStartDateTime( this.originalPopulatedStartTime);
    }

    resetNowTimeToCurrent() {
        this.setNowDateTime(new Date());
    }

    populate() {
        this.dateTime.year   = this.dateNow.getUTCFullYear();
        this.dateTime.month  = this.dateNow.getUTCMonth() + 1; // Months are 0-indexed in JavaScript
        this.dateTime.day    = this.dateNow.getUTCDate();
        this.dateTime.hour   = this.dateNow.getUTCHours();
        this.dateTime.minute = this.dateNow.getUTCMinutes();
        this.dateTime.second = this.dateNow.getUTCSeconds();
        this.dateTime.millisecond = this.dateNow.getUTCMilliseconds();

        Sit.startTime = this.dateStart.toISOString();
        Sit.nowTime   = this.dateNow.toISOString();

    }

    populateStartTimeFromUTCString(utcString) {
        // make a copy of the the original start time, so we can reset to it later with a UI button
        this.originalPopulatedStartTime = new Date(utcString);
        this.setStartDateTime(new Date(utcString));
    }


    // toUTCString() {
    //      // Return the UTC string representation
    //      return this.dateNow.toISOString();
    //  }
    //
    // toLocalString() {
    //     return this.dateNow.toLocalString();
    // }

    // update the start and now date members from the dateTime member
    // i.e. takes all the UI entires, and sets the now time, which will set the start time
    updateDateTime(v) {
        if (!this.refreshingUI) {
            this.setNowDateTime(new Date(Date.UTC(
                this.dateTime.year,
                this.dateTime.month - 1, // Months are 0-indexed in JavaScript
                this.dateTime.day,
                this.dateTime.hour,
                this.dateTime.minute,
                this.dateTime.second,
                this.dateTime.millisecond,
            )))
            this.recalculateCascade()
            par.renderOne = true;
        }
    }

    // ms since the start of the epoch
    getStartTimeValue() {
        return this.dateStart.valueOf()
    }

    getStartTimeString() {
        return this.dateStart.toISOString()
    }

    // adjust start time by t seconds, for example when the user presses a key, like [ or ]
    AdjustStartTime(t) {
        var time = this.getStartTimeValue()
        time += t
        this.setStartDateTime(new Date(time))
        this.populate()
        // some done twice here, look into tidying up
        this.updateDateTime()
    }


// given a frame number then return the time in ms since the start of the epoch
    frameToMS(frame) {
        const startMS = this.dateStart.valueOf();
        const MS = (Math.round(startMS + frame * 1000 * (Sit.simSpeed??1)/ Sit.fps))
        return MS;
    }

    update(frame) {
        this.frame = frame
        this.dateNow = startToNowDateTime(this.dateStart);

        this.refreshingUI = true;
        this.populate();
        this.refreshingUI = false;

        var speedscale = 1;
        if (isKeyHeld('shift'))
            speedscale *= 10
        if (isKeyHeld('control'))
            speedscale *= 100
        if (isKeyHeld('alt'))
            speedscale *= 1000
        if (isKeyHeld('meta'))
            speedscale *= 10000

        if (isKeyCodeHeld('Semicolon')) {
            this.AdjustStartTime(-1000*speedscale)
        }
        if (isKeyCodeHeld('Quote')) {
            this.AdjustStartTime(1000*speedscale)
        }

        if (isKeyCodeHeld('BracketLeft')) {
            this.AdjustStartTime(-3000*speedscale)
        }
        if (isKeyCodeHeld('BracketRight')) {
            this.AdjustStartTime(3000*speedscale)
        }


        this.nowGST = calculateGST(this.nowDate)
    }

    // getDateNow(frame) {
    //     return this.dateNow;
    //     }

}

// export var GlobalDateTimeNode;
//
// export function MakeDateTimeNode() {
//     GlobalDateTimeNode = new CNodeDateTime({
//         id:"dat",
//     })
// }



