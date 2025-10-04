/**
 * Utility functions for the application
 */

/**
 * Converts snake_case or camelCase strings to Pretty Case for display labels
 * Examples:
 * - "inception_date" -> "Inception Date"
 * - "legal_name" -> "Legal Name"
 * - "contactEmail" -> "Contact Email"
 * - "registration_number" -> "Registration Number"
 */
export const prettyPrint = (str: string): string => {
  if (!str) return "";

  // Handle camelCase by inserting spaces before capital letters
  const withSpaces = str.replace(/([a-z])([A-Z])/g, "$1 $2");

  // Handle snake_case by replacing underscores with spaces
  const withoutUnderscores = withSpaces.replace(/_/g, " ");

  // Capitalize first letter of each word
  return withoutUnderscores
    .split(" ")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
};

/**
 * Validates if a string is a valid email address
 */
export const isValidEmail = (email: string): boolean => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

/**
 * Formats a date object to YYYY-MM-DD string for date inputs
 */
export const formatDateForInput = (date: Date): string => {
  return date.toISOString().split("T")[0];
};

/**
 * Parses a date string (YYYY-MM-DD) to a Date object
 */
export const parseDateFromInput = (dateStr: string): Date | null => {
  if (!dateStr) return null;
  const date = new Date(dateStr);
  return isNaN(date.getTime()) ? null : date;
};

/**
 * Date/Time utilities for consistent timezone handling
 * - Server always stores dates in UTC
 * - UI always displays dates in user's local timezone
 * - UI always sends dates to server in UTC
 */

/**
 * Parse a date from the server (assumes UTC) and return a Date object
 */
export const parseServerDate = (dateString: string): Date => {
  // Ensure the date string is treated as UTC
  const utcString = dateString.includes("Z") ? dateString : dateString + "Z";
  return new Date(utcString);
};

/**
 * Format a date for display in the user's local timezone
 */
export const formatLocalDate = (date: Date): string => {
  return date.toLocaleString([], {
    timeZoneName: "short",
  });
};

/**
 * Format a date for display in the user's local timezone (short format)
 */
export const formatLocalDateShort = (date: Date): string => {
  const dateStr = date.toLocaleDateString();
  const timeStr = date.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    timeZoneName: "short",
  });
  return `${dateStr} ${timeStr}`;
};

/**
 * Convert a local date to UTC string for sending to server
 */
export const toServerDate = (date: Date): string => {
  return date.toISOString();
};

/**
 * Get current time as UTC string for server
 */
export const nowAsServerDate = (): string => {
  return new Date().toISOString();
};

/**
 * Format a database timestamp (stored in GMT) for display in user's local timezone
 * Database timestamps are typically in format "2025-09-22 20:08:44" (GMT)
 * This function converts them to proper local timezone display
 */
export const formatDatabaseTimestamp = (dbTimestamp: string): string => {
  try {
    // Database stores timestamps in GMT/UTC format like "2025-09-22 20:08:44"
    // We need to explicitly treat this as UTC, then convert to local timezone

    // If the timestamp doesn't already have timezone info, add 'Z' to indicate UTC
    let utcString = dbTimestamp;
    if (
      !dbTimestamp.includes("T") &&
      !dbTimestamp.includes("Z") &&
      !dbTimestamp.includes("+")
    ) {
      // Convert "2025-09-22 20:08:44" to "2025-09-22T20:08:44Z"
      utcString = dbTimestamp.replace(" ", "T") + "Z";
    }

    const date = new Date(utcString);
    return date.toLocaleString(undefined, {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      timeZoneName: "short",
    });
  } catch (error) {
    console.error("Error formatting database timestamp:", error);
    return dbTimestamp; // Fallback to original string
  }
};

/**
 * JSON utilities for consistent handling of data that might be string or object
 */

/**
 * Safely parse JSON data that might already be an object or a JSON string
 * Used for handling database fields that store JSON as strings
 */
export const parseJsonField = (data: any): Record<string, any> => {
  if (!data) return {};

  if (typeof data === "object") {
    return data;
  }

  if (typeof data === "string") {
    try {
      return JSON.parse(data);
    } catch {
      return {};
    }
  }

  return {};
};

/**
 * Prepare JSON data for form editing
 * Returns both the parsed object and the JSON string representation
 */
export const prepareJsonForForm = (
  data: any
): {
  object: Record<string, any>;
  jsonString: string;
} => {
  const parsedObject = parseJsonField(data);
  return {
    object: parsedObject,
    jsonString: JSON.stringify(parsedObject, null, 2),
  };
};

/**
 * Number formatting utilities for user-friendly display
 */

/**
 * Format a number with thousands separators (commas)
 * Examples: 1000 -> "1,000", 1234567.89 -> "1,234,567.89"
 */
export const formatNumberWithCommas = (value: number | string): string => {
  if (value === null || value === undefined || value === "") return "";

  const numValue = typeof value === "string" ? parseFloat(value) : value;
  if (isNaN(numValue)) return "";

  return numValue.toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
};

/**
 * Parse a formatted number string back to a number
 * Removes commas and converts to number
 * Examples: "1,000" -> 1000, "1,234,567.89" -> 1234567.89
 */
export const parseFormattedNumber = (value: string): number => {
  if (!value) return 0;

  // Remove commas and parse
  const cleanValue = value.replace(/,/g, "");
  const parsed = parseFloat(cleanValue);

  return isNaN(parsed) ? 0 : parsed;
};

/**
 * Parse numeric shortcuts (k, m, b) to actual numbers
 * Examples: "1k" -> 1000, "78m" -> 78000000, "6.67b" -> 6670000000
 */
export const parseNumericShortcut = (value: string): number => {
  if (!value) return 0;

  const trimmed = value.trim().toLowerCase();
  const match = trimmed.match(/^([\d,]+\.?\d*)\s*([kmb])?$/);

  if (!match) return 0;

  const [, numberPart, suffix] = match;
  const baseNumber = parseFormattedNumber(numberPart);

  if (isNaN(baseNumber)) return 0;

  switch (suffix) {
    case "k":
      return baseNumber * 1000;
    case "m":
      return baseNumber * 1000000;
    case "b":
      return baseNumber * 1000000000;
    default:
      return baseNumber;
  }
};

/**
 * Format a number for display in forms (with commas)
 * Handles both string and number inputs
 */
export const formatNumberForDisplay = (value: number | string): string => {
  if (value === null || value === undefined || value === "") return "";

  // If it's already a formatted string with commas, return as-is
  if (typeof value === "string" && value.includes(",")) {
    return value;
  }

  return formatNumberWithCommas(value);
};

/**
 * Format a number for display in price fields (preserves exact decimal precision)
 * Unlike formatNumberForDisplay, this doesn't round to 2 decimal places
 */
export const formatPriceForDisplay = (value: number | string): string => {
  if (value === null || value === undefined || value === "") return "";

  // If it's already a formatted string with commas, return as-is
  if (typeof value === "string" && value.includes(",")) {
    return value;
  }

  const numValue = typeof value === "string" ? parseFloat(value) : value;
  if (isNaN(numValue)) return "";

  // Use toLocaleString but with more decimal places to preserve precision
  return numValue.toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 10, // Allow up to 10 decimal places for prices
  });
};
