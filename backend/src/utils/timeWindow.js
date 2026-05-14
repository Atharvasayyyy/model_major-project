const VALID_WINDOWS = ["today", "7d", "30d", "all"];

/**
 * Parses a window string into a Date range for MongoDB queries.
 *
 * Time semantics: "today" uses server's local timezone midnight.
 * Other windows are relative to current moment.
 *
 * @param {string} window - one of "today", "7d", "30d", "all"
 * @returns {{ start: Date|null, end: Date, window: string }}
 *   start: null for "all", else the inclusive start boundary
 *   end: always now (current moment)
 */
function parseTimeWindow(window) {
  const normalized = (window || "7d").toLowerCase();
  const end = new Date();

  if (!VALID_WINDOWS.includes(normalized)) {
    throw new Error(
      `Invalid window: ${window}. Must be one of: ${VALID_WINDOWS.join(", ")}`,
    );
  }

  if (normalized === "all") {
    return { start: null, end, window: normalized };
  }

  if (normalized === "today") {
    const start = new Date();
    start.setHours(0, 0, 0, 0); // server-local midnight
    return { start, end, window: normalized };
  }

  if (normalized === "7d") {
    const start = new Date(end.getTime() - 7 * 24 * 60 * 60 * 1000);
    return { start, end, window: normalized };
  }

  if (normalized === "30d") {
    const start = new Date(end.getTime() - 30 * 24 * 60 * 60 * 1000);
    return { start, end, window: normalized };
  }
}

/**
 * Builds the MongoDB $match filter for a time window.
 * Returns an empty object for "all" (no time filter).
 *
 * @param {string} window - one of "today", "7d", "30d", "all"
 * @param {string} fieldName - the document field to filter on (default: "timestamp")
 * @returns {object} MongoDB $match-compatible filter fragment
 */
function buildTimeMatch(window, fieldName = "timestamp") {
  const { start, end } = parseTimeWindow(window);
  if (!start) return {};
  return { [fieldName]: { $gte: start, $lte: end } };
}

module.exports = { parseTimeWindow, buildTimeMatch, VALID_WINDOWS };
