/**
 * Record parsers for each GTFS file type.
 * Each parser validates a single row and returns the typed record or null.
 */

import type {
    Agency,
    Stop,
    Route,
    Trip,
    StopTime,
    Calendar,
    CalendarDate,
    Shape,
    FeedInfo,
    Frequency,
    Transfer,
    ParseIssue,
} from "./types.js";
import {
    isNonEmptyString,
    isValidLatitude,
    isValidLongitude,
    isValidGtfsDate,
    isValidGtfsTime,
    isStrictNonNegativeInteger,
    toIntegerOrNull,
    toFloatOrNull,
    isValidDirectionId,
    isValidLocationType,
    isValidWheelchair,
    isValidBikesAllowed,
    isValidPickupDropOff,
    isValidTimepoint,
    isValidExceptionType,
    isValidExactTimes,
    isValidTransferType,
    isValidCalendarWeekday,
    weekdayToBoolean,
    createIssue,
} from "./validators.js";

export interface ParseContext {
    fileName: string;
    row: number;
}

export interface ParseResult<T> {
    record: T | null;
    issues: ParseIssue[];
    errorCount: number;
    warningCount: number;
}

type RecordParser<T> = (record: Record<string, string>, ctx: ParseContext) => ParseResult<T>;

type ParseState = {
    issues: ParseIssue[];
    errorCount: number;
    warningCount: number;
};

function tryAddIssue(
    state: ParseState,
    issue: ParseIssue
): ParseState {
    return {
        issues: [...state.issues, issue],
        errorCount: state.errorCount + 1,
        warningCount: state.warningCount,
    };
}

function tryAddWarning(
    state: ParseState,
    issue: ParseIssue
): ParseState {
    return {
        issues: [...state.issues, issue],
        errorCount: state.errorCount,
        warningCount: state.warningCount + 1,
    };
}

function createMissingFieldIssue(ctx: ParseContext, field: string): ParseIssue {
    return createIssue(ctx.fileName, ctx.row, `Missing required field: ${field}`, field);
}

function createInvalidFieldIssue(
    ctx: ParseContext,
    field: string,
    value: string,
    message: string
): ParseIssue {
    return createIssue(ctx.fileName, ctx.row, message, field, value);
}

// Required headers for each file type
export const REQUIRED_HEADERS: Record<string, string[]> = {
    "agency.txt": ["agency_name", "agency_url", "agency_timezone"],
    "stops.txt": ["stop_id", "stop_name", "stop_lat", "stop_lon"],
    "routes.txt": ["route_id", "route_type"],
    "trips.txt": ["route_id", "service_id", "trip_id"],
    "stop_times.txt": ["trip_id", "arrival_time", "departure_time", "stop_id", "stop_sequence"],
    "calendar.txt": [
        "service_id",
        "monday",
        "tuesday",
        "wednesday",
        "thursday",
        "friday",
        "saturday",
        "sunday",
        "start_date",
        "end_date",
    ],
    "calendar_dates.txt": ["service_id", "date", "exception_type"],
    "shapes.txt": ["shape_id", "shape_pt_lat", "shape_pt_lon", "shape_pt_sequence"],
    "feed_info.txt": [], // All fields optional
    "frequencies.txt": ["trip_id", "start_time", "end_time", "headway_secs"],
    "transfers.txt": ["from_stop_id", "to_stop_id"],
};

export function validateHeaders(
    fileName: string,
    headers: string[]
): { valid: boolean; missing: string[] } {
    const required = REQUIRED_HEADERS[fileName] || [];
    const lowerHeaders = headers.map((h) => h.toLowerCase().trim());
    const missing = required.filter((r) => !lowerHeaders.includes(r.toLowerCase()));
    return { valid: missing.length === 0, missing };
}

export const parsers: Record<string, RecordParser<unknown>> = {
    "agency.txt": parseAgency,
    "stops.txt": parseStop,
    "routes.txt": parseRoute,
    "trips.txt": parseTrip,
    "stop_times.txt": parseStopTime,
    "calendar.txt": parseCalendar,
    "calendar_dates.txt": parseCalendarDate,
    "shapes.txt": parseShape,
    "feed_info.txt": parseFeedInfo,
    "frequencies.txt": parseFrequency,
    "transfers.txt": parseTransfer,
};

function parseAgency(record: Record<string, string>, ctx: ParseContext): ParseResult<Agency> {
    let state: ParseState = { issues: [], errorCount: 0, warningCount: 0 };

    const agencyId = record["agency_id"]?.trim() || null;
    const agencyName = record["agency_name"]?.trim();
    const agencyUrl = record["agency_url"]?.trim();
    const agencyTimezone = record["agency_timezone"]?.trim();

    if (!isNonEmptyString(agencyName)) {
        state = tryAddIssue(state, createMissingFieldIssue(ctx, "agency_name"));
    }
    if (!isNonEmptyString(agencyUrl)) {
        state = tryAddIssue(state, createMissingFieldIssue(ctx, "agency_url"));
    }
    if (!isNonEmptyString(agencyTimezone)) {
        state = tryAddIssue(state, createMissingFieldIssue(ctx, "agency_timezone"));
    }

    if (state.errorCount > 0) {
        return { record: null, issues: state.issues, errorCount: state.errorCount, warningCount: state.warningCount };
    }

    return {
        record: { agencyId, agencyName: agencyName!, agencyUrl: agencyUrl!, agencyTimezone: agencyTimezone! },
        issues: state.issues,
        errorCount: state.errorCount,
        warningCount: state.warningCount,
    };
}

function parseStop(record: Record<string, string>, ctx: ParseContext): ParseResult<Stop> {
    let state: ParseState = { issues: [], errorCount: 0, warningCount: 0 };

    const stopId = record["stop_id"]?.trim();
    const stopName = record["stop_name"]?.trim();
    const stopLat = toFloatOrNull(record["stop_lat"]);
    const stopLon = toFloatOrNull(record["stop_lon"]);
    const locationType = toIntegerOrNull(record["location_type"]);
    const parentStation = record["parent_station"]?.trim() || null;
    const wheelchairBoarding = toIntegerOrNull(record["wheelchair_boarding"]);

    if (!isNonEmptyString(stopId)) {
        state = tryAddIssue(state, createMissingFieldIssue(ctx, "stop_id"));
    }
    if (!isNonEmptyString(stopName)) {
        state = tryAddIssue(state, createMissingFieldIssue(ctx, "stop_name"));
    }
    if (stopLat === null) {
        state = tryAddIssue(state, createInvalidFieldIssue(ctx, "stop_lat", record["stop_lat"] || "", "Invalid or missing stop latitude"));
    } else if (!isValidLatitude(stopLat)) {
        state = tryAddIssue(state, createInvalidFieldIssue(ctx, "stop_lat", record["stop_lat"] || "", `Invalid latitude value: ${stopLat}. Must be between -90 and 90`));
    }
    if (stopLon === null) {
        state = tryAddIssue(state, createInvalidFieldIssue(ctx, "stop_lon", record["stop_lon"] || "", "Invalid or missing stop longitude"));
    } else if (!isValidLongitude(stopLon)) {
        state = tryAddIssue(state, createInvalidFieldIssue(ctx, "stop_lon", record["stop_lon"] || "", `Invalid longitude value: ${stopLon}. Must be between -180 and 180`));
    }
    if (locationType !== null && !isValidLocationType(locationType)) {
        state = tryAddIssue(state, createInvalidFieldIssue(ctx, "location_type", record["location_type"] || "", "Invalid location_type value"));
    }
    if (wheelchairBoarding !== null && !isValidWheelchair(wheelchairBoarding)) {
        state = tryAddIssue(state, createInvalidFieldIssue(ctx, "wheelchair_boarding", record["wheelchair_boarding"] || "", "Invalid wheelchair_boarding value"));
    }

    if (state.errorCount > 0) {
        return { record: null, issues: state.issues, errorCount: state.errorCount, warningCount: state.warningCount };
    }

    return {
        record: { stopId: stopId!, stopName: stopName!, stopLat: stopLat!, stopLon: stopLon!, locationType, parentStation, wheelchairBoarding },
        issues: state.issues,
        errorCount: state.errorCount,
        warningCount: state.warningCount,
    };
}

function parseRoute(record: Record<string, string>, ctx: ParseContext): ParseResult<Route> {
    let state: ParseState = { issues: [], errorCount: 0, warningCount: 0 };

    const routeId = record["route_id"]?.trim();
    const agencyId = record["agency_id"]?.trim() || null;
    const routeShortName = record["route_short_name"]?.trim() || null;
    const routeLongName = record["route_long_name"]?.trim() || null;
    const routeType = toIntegerOrNull(record["route_type"]);

    if (!isNonEmptyString(routeId)) {
        state = tryAddIssue(state, createMissingFieldIssue(ctx, "route_id"));
    }
    if (routeType === null) {
        state = tryAddIssue(state, createMissingFieldIssue(ctx, "route_type"));
    } else if (!isStrictNonNegativeInteger(routeType)) {
        state = tryAddIssue(state, createInvalidFieldIssue(ctx, "route_type", record["route_type"] || "", "Invalid route_type value"));
    }

    if (state.errorCount > 0) {
        return { record: null, issues: state.issues, errorCount: state.errorCount, warningCount: state.warningCount };
    }

    return {
        record: { routeId: routeId!, agencyId, routeShortName, routeLongName, routeType: routeType! },
        issues: state.issues,
        errorCount: state.errorCount,
        warningCount: state.warningCount,
    };
}

function parseTrip(record: Record<string, string>, ctx: ParseContext): ParseResult<Trip> {
    let state: ParseState = { issues: [], errorCount: 0, warningCount: 0 };

    const routeId = record["route_id"]?.trim();
    const serviceId = record["service_id"]?.trim();
    const tripId = record["trip_id"]?.trim();
    const tripHeadsign = record["trip_headsign"]?.trim() || null;
    const tripShortName = record["trip_short_name"]?.trim() || null;
    const directionId = toIntegerOrNull(record["direction_id"]);
    const blockId = record["block_id"]?.trim() || null;
    const shapeId = record["shape_id"]?.trim() || null;
    const wheelchairAccessible = toIntegerOrNull(record["wheelchair_accessible"]);
    const bikesAllowed = toIntegerOrNull(record["bikes_allowed"]);

    if (!isNonEmptyString(routeId)) {
        state = tryAddIssue(state, createMissingFieldIssue(ctx, "route_id"));
    }
    if (!isNonEmptyString(serviceId)) {
        state = tryAddIssue(state, createMissingFieldIssue(ctx, "service_id"));
    }
    if (!isNonEmptyString(tripId)) {
        state = tryAddIssue(state, createMissingFieldIssue(ctx, "trip_id"));
    }
    if (directionId !== null && !isValidDirectionId(directionId)) {
        state = tryAddIssue(state, createInvalidFieldIssue(ctx, "direction_id", record["direction_id"] || "", "Invalid direction_id. Must be 0 or 1"));
    }
    if (wheelchairAccessible !== null && !isValidWheelchair(wheelchairAccessible)) {
        state = tryAddIssue(state, createInvalidFieldIssue(ctx, "wheelchair_accessible", record["wheelchair_accessible"] || "", "Invalid wheelchair_accessible value"));
    }
    if (bikesAllowed !== null && !isValidBikesAllowed(bikesAllowed)) {
        state = tryAddIssue(state, createInvalidFieldIssue(ctx, "bikes_allowed", record["bikes_allowed"] || "", "Invalid bikes_allowed value"));
    }

    if (state.errorCount > 0) {
        return { record: null, issues: state.issues, errorCount: state.errorCount, warningCount: state.warningCount };
    }

    return {
        record: { routeId: routeId!, serviceId: serviceId!, tripId: tripId!, tripHeadsign, tripShortName, directionId, blockId, shapeId, wheelchairAccessible, bikesAllowed },
        issues: state.issues,
        errorCount: state.errorCount,
        warningCount: state.warningCount,
    };
}

function parseStopTime(record: Record<string, string>, ctx: ParseContext): ParseResult<StopTime> {
    let state: ParseState = { issues: [], errorCount: 0, warningCount: 0 };

    const tripId = record["trip_id"]?.trim();
    const arrivalTime = record["arrival_time"]?.trim();
    const departureTime = record["departure_time"]?.trim();
    const stopId = record["stop_id"]?.trim();
    const stopSequence = toIntegerOrNull(record["stop_sequence"]);
    const stopHeadsign = record["stop_headsign"]?.trim() || null;
    const pickupType = toIntegerOrNull(record["pickup_type"]);
    const dropOffType = toIntegerOrNull(record["drop_off_type"]);
    const timepoint = toIntegerOrNull(record["timepoint"]);

    if (!isNonEmptyString(tripId)) {
        state = tryAddIssue(state, createMissingFieldIssue(ctx, "trip_id"));
    }
    if (!isNonEmptyString(arrivalTime)) {
        state = tryAddIssue(state, createMissingFieldIssue(ctx, "arrival_time"));
    } else if (!isValidGtfsTime(arrivalTime)) {
        state = tryAddIssue(state, createInvalidFieldIssue(ctx, "arrival_time", arrivalTime, `Invalid arrival_time format. Expected H+:MM:SS`));
    }
    if (!isNonEmptyString(departureTime)) {
        state = tryAddIssue(state, createMissingFieldIssue(ctx, "departure_time"));
    } else if (!isValidGtfsTime(departureTime)) {
        state = tryAddIssue(state, createInvalidFieldIssue(ctx, "departure_time", departureTime, `Invalid departure_time format. Expected H+:MM:SS`));
    }
    if (!isNonEmptyString(stopId)) {
        state = tryAddIssue(state, createMissingFieldIssue(ctx, "stop_id"));
    }
    if (stopSequence === null) {
        state = tryAddIssue(state, createMissingFieldIssue(ctx, "stop_sequence"));
    } else if (!isStrictNonNegativeInteger(stopSequence)) {
        state = tryAddIssue(state, createInvalidFieldIssue(ctx, "stop_sequence", record["stop_sequence"] || "", "Invalid stop_sequence. Must be a non-negative integer"));
    }
    if (pickupType !== null && !isValidPickupDropOff(pickupType)) {
        state = tryAddIssue(state, createInvalidFieldIssue(ctx, "pickup_type", record["pickup_type"] || "", "Invalid pickup_type value"));
    }
    if (dropOffType !== null && !isValidPickupDropOff(dropOffType)) {
        state = tryAddIssue(state, createInvalidFieldIssue(ctx, "drop_off_type", record["drop_off_type"] || "", "Invalid drop_off_type value"));
    }
    if (timepoint !== null && !isValidTimepoint(timepoint)) {
        state = tryAddIssue(state, createInvalidFieldIssue(ctx, "timepoint", record["timepoint"] || "", "Invalid timepoint value. Must be 0 or 1"));
    }

    if (state.errorCount > 0) {
        return { record: null, issues: state.issues, errorCount: state.errorCount, warningCount: state.warningCount };
    }

    return {
        record: { tripId: tripId!, arrivalTime: arrivalTime!, departureTime: departureTime!, stopId: stopId!, stopSequence: stopSequence!, stopHeadsign, pickupType, dropOffType, timepoint },
        issues: state.issues,
        errorCount: state.errorCount,
        warningCount: state.warningCount,
    };
}

function parseCalendar(record: Record<string, string>, ctx: ParseContext): ParseResult<Calendar> {
    let state: ParseState = { issues: [], errorCount: 0, warningCount: 0 };

    const serviceId = record["service_id"]?.trim();
    const monday = toIntegerOrNull(record["monday"]);
    const tuesday = toIntegerOrNull(record["tuesday"]);
    const wednesday = toIntegerOrNull(record["wednesday"]);
    const thursday = toIntegerOrNull(record["thursday"]);
    const friday = toIntegerOrNull(record["friday"]);
    const saturday = toIntegerOrNull(record["saturday"]);
    const sunday = toIntegerOrNull(record["sunday"]);
    const startDate = record["start_date"]?.trim();
    const endDate = record["end_date"]?.trim();

    if (!isNonEmptyString(serviceId)) {
        state = tryAddIssue(state, createMissingFieldIssue(ctx, "service_id"));
    }

    const weekdays: [string, number | null][] = [
        ["monday", monday],
        ["tuesday", tuesday],
        ["wednesday", wednesday],
        ["thursday", thursday],
        ["friday", friday],
        ["saturday", saturday],
        ["sunday", sunday],
    ];
    for (const [day, value] of weekdays) {
        if (value === null) {
            state = tryAddIssue(state, createMissingFieldIssue(ctx, day));
        } else if (!isValidCalendarWeekday(value)) {
            state = tryAddIssue(state, createInvalidFieldIssue(ctx, day, record[day] || "", `Invalid ${day} value. Must be 0 or 1`));
        }
    }

    if (!isNonEmptyString(startDate)) {
        state = tryAddIssue(state, createMissingFieldIssue(ctx, "start_date"));
    } else if (!isValidGtfsDate(startDate)) {
        state = tryAddIssue(state, createInvalidFieldIssue(ctx, "start_date", startDate, `Invalid GTFS date format. Expected YYYYMMDD`));
    }
    if (!isNonEmptyString(endDate)) {
        state = tryAddIssue(state, createMissingFieldIssue(ctx, "end_date"));
    } else if (!isValidGtfsDate(endDate)) {
        state = tryAddIssue(state, createInvalidFieldIssue(ctx, "end_date", endDate, `Invalid GTFS date format. Expected YYYYMMDD`));
    }

    if (state.errorCount > 0) {
        return { record: null, issues: state.issues, errorCount: state.errorCount, warningCount: state.warningCount };
    }

    return {
        record: {
            serviceId: serviceId!,
            monday: weekdayToBoolean(monday!),
            tuesday: weekdayToBoolean(tuesday!),
            wednesday: weekdayToBoolean(wednesday!),
            thursday: weekdayToBoolean(thursday!),
            friday: weekdayToBoolean(friday!),
            saturday: weekdayToBoolean(saturday!),
            sunday: weekdayToBoolean(sunday!),
            startDate: startDate!,
            endDate: endDate!,
        },
        issues: state.issues,
        errorCount: state.errorCount,
        warningCount: state.warningCount,
    };
}

function parseCalendarDate(record: Record<string, string>, ctx: ParseContext): ParseResult<CalendarDate> {
    let state: ParseState = { issues: [], errorCount: 0, warningCount: 0 };

    const serviceId = record["service_id"]?.trim();
    const date = record["date"]?.trim();
    const exceptionType = toIntegerOrNull(record["exception_type"]);

    if (!isNonEmptyString(serviceId)) {
        state = tryAddIssue(state, createMissingFieldIssue(ctx, "service_id"));
    }
    if (!isNonEmptyString(date)) {
        state = tryAddIssue(state, createMissingFieldIssue(ctx, "date"));
    } else if (!isValidGtfsDate(date)) {
        state = tryAddIssue(state, createInvalidFieldIssue(ctx, "date", date, `Invalid GTFS date format. Expected YYYYMMDD`));
    }
    if (exceptionType === null) {
        state = tryAddIssue(state, createMissingFieldIssue(ctx, "exception_type"));
    } else if (!isValidExceptionType(exceptionType)) {
        state = tryAddIssue(state, createInvalidFieldIssue(ctx, "exception_type", record["exception_type"] || "", "Invalid exception_type. Must be 1 or 2"));
    }

    if (state.errorCount > 0) {
        return { record: null, issues: state.issues, errorCount: state.errorCount, warningCount: state.warningCount };
    }

    return {
        record: { serviceId: serviceId!, date: date!, exceptionType: exceptionType! },
        issues: state.issues,
        errorCount: state.errorCount,
        warningCount: state.warningCount,
    };
}

function parseShape(record: Record<string, string>, ctx: ParseContext): ParseResult<Shape> {
    let state: ParseState = { issues: [], errorCount: 0, warningCount: 0 };

    const shapeId = record["shape_id"]?.trim();
    const shapePtLat = toFloatOrNull(record["shape_pt_lat"]);
    const shapePtLon = toFloatOrNull(record["shape_pt_lon"]);
    const shapePtSequence = toIntegerOrNull(record["shape_pt_sequence"]);
    const shapeDistTraveled = toFloatOrNull(record["shape_dist_traveled"]);

    if (!isNonEmptyString(shapeId)) {
        state = tryAddIssue(state, createMissingFieldIssue(ctx, "shape_id"));
    }
    if (shapePtLat === null) {
        state = tryAddIssue(state, createMissingFieldIssue(ctx, "shape_pt_lat"));
    } else if (!isValidLatitude(shapePtLat)) {
        state = tryAddIssue(state, createInvalidFieldIssue(ctx, "shape_pt_lat", record["shape_pt_lat"] || "", `Invalid latitude value: ${shapePtLat}. Must be between -90 and 90`));
    }
    if (shapePtLon === null) {
        state = tryAddIssue(state, createMissingFieldIssue(ctx, "shape_pt_lon"));
    } else if (!isValidLongitude(shapePtLon)) {
        state = tryAddIssue(state, createInvalidFieldIssue(ctx, "shape_pt_lon", record["shape_pt_lon"] || "", `Invalid longitude value: ${shapePtLon}. Must be between -180 and 180`));
    }
    if (shapePtSequence === null) {
        state = tryAddIssue(state, createMissingFieldIssue(ctx, "shape_pt_sequence"));
    } else if (!isStrictNonNegativeInteger(shapePtSequence)) {
        state = tryAddIssue(state, createInvalidFieldIssue(ctx, "shape_pt_sequence", record["shape_pt_sequence"] || "", "Invalid shape_pt_sequence. Must be a non-negative integer"));
    }

    if (state.errorCount > 0) {
        return { record: null, issues: state.issues, errorCount: state.errorCount, warningCount: state.warningCount };
    }

    return {
        record: { shapeId: shapeId!, shapePtLat: shapePtLat!, shapePtLon: shapePtLon!, shapePtSequence: shapePtSequence!, shapeDistTraveled },
        issues: state.issues,
        errorCount: state.errorCount,
        warningCount: state.warningCount,
    };
}

function parseFeedInfo(record: Record<string, string>, ctx: ParseContext): ParseResult<FeedInfo> {
    let state: ParseState = { issues: [], errorCount: 0, warningCount: 0 };

    const feedPublisherName = record["feed_publisher_name"]?.trim() || null;
    const feedPublisherUrl = record["feed_publisher_url"]?.trim() || null;
    const feedLang = record["feed_lang"]?.trim() || null;
    const feedStartDate = record["feed_start_date"]?.trim() || null;
    const feedEndDate = record["feed_end_date"]?.trim() || null;
    const feedVersion = record["feed_version"]?.trim() || null;
    const feedContactEmail = record["feed_contact_email"]?.trim() || null;
    const feedContactUrl = record["feed_contact_url"]?.trim() || null;

    if (feedStartDate !== null && !isValidGtfsDate(feedStartDate)) {
        state = tryAddWarning(state, createInvalidFieldIssue(ctx, "feed_start_date", feedStartDate, `Invalid GTFS date format. Expected YYYYMMDD`));
    }
    if (feedEndDate !== null && !isValidGtfsDate(feedEndDate)) {
        state = tryAddWarning(state, createInvalidFieldIssue(ctx, "feed_end_date", feedEndDate, `Invalid GTFS date format. Expected YYYYMMDD`));
    }

    return {
        record: { feedPublisherName, feedPublisherUrl, feedLang, feedStartDate, feedEndDate, feedVersion, feedContactEmail, feedContactUrl },
        issues: state.issues,
        errorCount: state.errorCount,
        warningCount: state.warningCount,
    };
}

function parseFrequency(record: Record<string, string>, ctx: ParseContext): ParseResult<Frequency> {
    let state: ParseState = { issues: [], errorCount: 0, warningCount: 0 };

    const tripId = record["trip_id"]?.trim();
    const startTime = record["start_time"]?.trim();
    const endTime = record["end_time"]?.trim();
    const headwaySecs = toIntegerOrNull(record["headway_secs"]);
    const exactTimes = toIntegerOrNull(record["exact_times"]);

    if (!isNonEmptyString(tripId)) {
        state = tryAddIssue(state, createMissingFieldIssue(ctx, "trip_id"));
    }
    if (!isNonEmptyString(startTime)) {
        state = tryAddIssue(state, createMissingFieldIssue(ctx, "start_time"));
    } else if (!isValidGtfsTime(startTime)) {
        state = tryAddIssue(state, createInvalidFieldIssue(ctx, "start_time", startTime, `Invalid start_time format. Expected H+:MM:SS`));
    }
    if (!isNonEmptyString(endTime)) {
        state = tryAddIssue(state, createMissingFieldIssue(ctx, "end_time"));
    } else if (!isValidGtfsTime(endTime)) {
        state = tryAddIssue(state, createInvalidFieldIssue(ctx, "end_time", endTime, `Invalid end_time format. Expected H+:MM:SS`));
    }
    if (headwaySecs === null) {
        state = tryAddIssue(state, createMissingFieldIssue(ctx, "headway_secs"));
    } else if (!isStrictNonNegativeInteger(headwaySecs)) {
        state = tryAddIssue(state, createInvalidFieldIssue(ctx, "headway_secs", record["headway_secs"] || "", "Invalid headway_secs. Must be a non-negative integer"));
    }
    if (exactTimes !== null && !isValidExactTimes(exactTimes)) {
        state = tryAddIssue(state, createInvalidFieldIssue(ctx, "exact_times", record["exact_times"] || "", "Invalid exact_times. Must be 0 or 1"));
    }

    if (state.errorCount > 0) {
        return { record: null, issues: state.issues, errorCount: state.errorCount, warningCount: state.warningCount };
    }

    return {
        record: { tripId: tripId!, startTime: startTime!, endTime: endTime!, headwaySecs: headwaySecs!, exactTimes },
        issues: state.issues,
        errorCount: state.errorCount,
        warningCount: state.warningCount,
    };
}

function parseTransfer(record: Record<string, string>, ctx: ParseContext): ParseResult<Transfer> {
    let state: ParseState = { issues: [], errorCount: 0, warningCount: 0 };

    const fromStopId = record["from_stop_id"]?.trim();
    const toStopId = record["to_stop_id"]?.trim();
    const transferType = toIntegerOrNull(record["transfer_type"]);
    const minTransferTime = toIntegerOrNull(record["min_transfer_time"]);

    if (!isNonEmptyString(fromStopId)) {
        state = tryAddIssue(state, createMissingFieldIssue(ctx, "from_stop_id"));
    }
    if (!isNonEmptyString(toStopId)) {
        state = tryAddIssue(state, createMissingFieldIssue(ctx, "to_stop_id"));
    }
    if (transferType !== null && !isValidTransferType(transferType)) {
        state = tryAddIssue(state, createInvalidFieldIssue(ctx, "transfer_type", record["transfer_type"] || "", "Invalid transfer_type value"));
    }
    if (minTransferTime !== null && !isStrictNonNegativeInteger(minTransferTime)) {
        state = tryAddIssue(state, createInvalidFieldIssue(ctx, "min_transfer_time", record["min_transfer_time"] || "", "Invalid min_transfer_time. Must be a non-negative integer"));
    }

    if (state.errorCount > 0) {
        return { record: null, issues: state.issues, errorCount: state.errorCount, warningCount: state.warningCount };
    }

    return {
        record: { fromStopId: fromStopId!, toStopId: toStopId!, transferType, minTransferTime },
        issues: state.issues,
        errorCount: state.errorCount,
        warningCount: state.warningCount,
    };
}