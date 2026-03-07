const activityMap = {
  reading: "cognitive_indoor",
  homework: "cognitive_indoor",
  drawing: "creative_indoor",
  football: "outdoor_sport",
  cycling: "outdoor_sport",
  gaming: "digital_activity",
};

function categorizeActivity(activity = "") {
  const key = String(activity).trim().toLowerCase();
  return activityMap[key] || "other";
}

module.exports = { categorizeActivity };
