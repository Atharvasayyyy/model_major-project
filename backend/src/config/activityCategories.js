const ACTIVITY_LIST         = ["Reading", "Math", "Drawing", "Sports", "Music", "Screen Time", "Free Play", "Other"];
const ACTIVE_ACTIVITIES     = ["Sports", "Free Play"];
const SEDENTARY_ACTIVITIES  = ["Reading", "Math", "Drawing", "Music", "Screen Time", "Other"];

/**
 * Returns "active" or "sedentary" for a given activity name.
 * Defaults to "sedentary" for unknown activities — safe default so that
 * an unrecognized activity never gets an undeserved motion-bonus boost.
 * @param {string} activityName
 * @returns {"active"|"sedentary"}
 */
function categorizeActivity(activityName) {
  if (typeof activityName !== "string") return "sedentary";
  if (ACTIVE_ACTIVITIES.includes(activityName.trim())) return "active";
  return "sedentary";
}

/**
 * Validates that the activity string is in the allowed list.
 * @param {string} activityName
 * @returns {boolean}
 */
function isValidActivity(activityName) {
  if (typeof activityName !== "string") return false;
  return ACTIVITY_LIST.includes(activityName.trim());
}

module.exports = { ACTIVITY_LIST, ACTIVE_ACTIVITIES, SEDENTARY_ACTIVITIES, categorizeActivity, isValidActivity };

