// Fix 2 — thin re-export so existing callers need no changes.
// All logic now lives in backend/src/config/activityCategories.js
const { categorizeActivity } = require("../config/activityCategories");
module.exports = categorizeActivity;

