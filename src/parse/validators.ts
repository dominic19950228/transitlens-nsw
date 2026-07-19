/**
 * Validation functions for GTFS data.
 * Strict validation - reject invalid values, don't substitute defaults.
 */

import type { ParseIssue } from "./types.js";

/**
 * Validates that a string is not empty.
 */
export function isNonEmptyString(value: string | null | undefined): value is string {
    return typeof value === "string" && value.trim().length > 0;
}

/**
 * Validates latitude is between -90 and 90.
 */
export function isValidLatitude(value: number): boolean {
    return Number.isFinite(value) && value >= -90 && value <= 90;
}

/**
 * Validates longitude is between -180 and 180.
 */
export function isValidLongitude(value: number): boolean {
    return Number.isFinite(value) && value >= -180 && value <= 180;
}

/**
 * Validates GTFS date format YYYYMMDD.
 */
export function isValidGtfsDate(value: string): boolean {
    if (!/^\d{8}$/.test(value)) {
        return false;
    }
    const year = parseInt(value.slice(0, 4), 10);
    const month = parseInt(value.slice(4, 6), 10);
    const day = parseInt(value.slice(6, 8), 10);

    if (month < 1 || month > 12) {
        return false;
    }
    if (day < 1 || day > 31) {
        return false;
    }
    if (month === 2 && day > 29) {
        return false;
    }
    if ([4, 6, 9, 11].includes(month) && day > 30) {
        return false;
    }
    if (year < 1900 || year > 2100) {
        return false;
    }

    // Check for valid calendar date
    const date = new Date(year, month - 1, day);
    return (
        date.getFullYear() === year &&
        date.getMonth() === month - 1 &&
        date.getDate() === day
    );
}

/**
 * Validates GTFS time format H+:MM:SS.
 * Hours may exceed 23.
 */
export function isValidGtfsTime(value: string): boolean {
    if (!/^\d+:\d{2}:\d{2}$/.test(value)) {
        return false;
    }
    const parts = value.split(":");
    const hours = parseInt(parts[0], 10);
    const minutes = parseInt(parts[1], 10);
    const seconds = parseInt(parts[2], 10);

    if (minutes < 0 || minutes > 59) {
        return false;
    }
    if (seconds < 0 || seconds > 59) {
        return false;
    }
    if (hours < 0) {
        return false;
    }
    if (hours > 9999) {
        return false;
    }

    return true;
}

/**
 * Validates that a value is a strict integer (no trailing characters).
 */
export function isStrictInteger(value: string | number): boolean {
    if (typeof value === "number") {
        return Number.isInteger(value);
    }
    const trimmed = value.trim();
    if (!/^-?\d+$/.test(trimmed)) {
        return false;
    }
    const num = parseInt(trimmed, 10);
    return Number.isFinite(num) && num.toString() === trimmed;
}

/**
 * Validates that a value is a strict positive integer.
 */
export function isStrictPositiveInteger(value: string | number): boolean {
    return isStrictInteger(value) && parseInt(String(value), 10) > 0;
}

/**
 * Validates that a value is a strict non-negative integer.
 */
export function isStrictNonNegativeInteger(value: string | number): boolean {
    return isStrictInteger(value) && parseInt(String(value), 10) >= 0;
}

/**
 * Validates that a value is a strict float (no trailing characters).
 * Accepts: 1.0, -33.000, 151.209300, .5, 0.50, -0.5
 * Rejects: 12abc, NaN, Infinity
 */
export function isStrictFloat(value: string | number): boolean {
    if (typeof value === "number") {
        return Number.isFinite(value);
    }
    const trimmed = value.trim();
    // Must have digits, optionally with decimal point
    if (!/^-?\d*\.?\d+$/.test(trimmed)) {
        return false;
    }
    const num = parseFloat(trimmed);
    if (!Number.isFinite(num)) {
        return false;
    }
    // Check that parsed value matches original representation
    // Handle equivalent representations (1.0 vs 1, 0.5 vs .5)
    const numStr = num.toString();
    if (numStr === trimmed) {
        return true;
    }
    // Allow .5 to match 0.5, 1.0 to match 1, etc.
    if (num === parseFloat(trimmed)) {
        return true;
    }
    return false;
}

/**
 * Converts string to integer or returns null if invalid.
 */
export function toIntegerOrNull(value: string | null | undefined): number | null {
    if (value === null || value === undefined || value.trim() === "") {
        return null;
    }
    if (isStrictInteger(value)) {
        return parseInt(value.trim(), 10);
    }
    return null;
}

/**
 * Converts string to float or returns null if invalid.
 */
export function toFloatOrNull(value: string | null | undefined): number | null {
    if (value === null || value === undefined || value.trim() === "") {
        return null;
    }
    if (isStrictFloat(value)) {
        return parseFloat(value.trim());
    }
    return null;
}

/**
 * Validates direction_id (0 or 1).
 */
export function isValidDirectionId(value: number | null): boolean {
    if (value === null) {
        return true;
    }
    return value === 0 || value === 1;
}

/**
 * Validates route_type (non-negative integer).
 */
export function isValidRouteType(value: number): boolean {
    return isStrictNonNegativeInteger(value);
}

/**
 * Validates location_type (0, 1, 2, 3, or 4).
 */
export function isValidLocationType(value: number | null): boolean {
    if (value === null) {
        return true;
    }
    return value >= 0 && value <= 4;
}

/**
 * Validates wheelchair_boarding / wheelchair_accessible (0, 1, or 2).
 */
export function isValidWheelchair(value: number | null): boolean {
    if (value === null) {
        return true;
    }
    return isStrictNonNegativeInteger(value) && value >= 0 && value <= 2;
}

/**
 * Validates bikes_allowed (0, 1, or 2).
 */
export function isValidBikesAllowed(value: number | null): boolean {
    if (value === null) {
        return true;
    }
    return isStrictNonNegativeInteger(value) && value >= 0 && value <= 2;
}

/**
 * Validates pickup_type / drop_off_type (0, 1, 2, or 3).
 */
export function isValidPickupDropOff(value: number | null): boolean {
    if (value === null) {
        return true;
    }
    return isStrictNonNegativeInteger(value) && value >= 0 && value <= 3;
}

/**
 * Validates timepoint (0 or 1).
 */
export function isValidTimepoint(value: number | null): boolean {
    if (value === null) {
        return true;
    }
    return value === 0 || value === 1;
}

/**
 * Validates exception_type (1 or 2).
 */
export function isValidExceptionType(value: number): boolean {
    return value === 1 || value === 2;
}

/**
 * Validates exact_times (0 or 1).
 */
export function isValidExactTimes(value: number | null): boolean {
    if (value === null) {
        return true;
    }
    return value === 0 || value === 1;
}

/**
 * Validates transfer_type (0, 1, 2, or 3).
 */
export function isValidTransferType(value: number | null): boolean {
    if (value === null) {
        return true;
    }
    return isStrictNonNegativeInteger(value) && value >= 0 && value <= 3;
}

/**
 * Validates calendar weekday value (0 or 1 only).
 */
export function isValidCalendarWeekday(value: number): boolean {
    return value === 0 || value === 1;
}

/**
 * Converts calendar weekday to boolean.
 */
export function weekdayToBoolean(value: number): boolean {
    return value === 1;
}

/**
 * Parses and validates coordinate from string.
 * Returns null if invalid.
 */
export function parseCoordinate(
    value: string | null | undefined,
    validator: (v: number) => boolean
): number | null {
    if (value === null || value === undefined || value.trim() === "") {
        return null;
    }
    const num = parseFloat(value.trim());
    if (!Number.isFinite(num)) {
        return null;
    }
    if (!validator(num)) {
        return null;
    }
    return num;
}

/**
 * Removes UTF-8 BOM if present.
 */
export function removeBom(line: string): string {
    if (line.charCodeAt(0) === 0xFEFF) {
        return line.slice(1);
    }
    return line;
}

/**
 * Creates a ParseIssue object.
 */
export function createIssue(
    fileName: string,
    row: number,
    message: string,
    field?: string,
    value?: string
): ParseIssue {
    return {
        fileName,
        row,
        message,
        ...(field !== undefined && { field }),
        ...(value !== undefined && { value }),
    };
}