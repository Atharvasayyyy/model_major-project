const express = require("express");
const { getActivityCategories, setActivity, startActivity, finishActivity, getActivityStatus, getActivityHistory } = require("../controllers/activityController");

// publicRouter — /categories needs no auth so the frontend can populate dropdowns
// without requiring the user to already hold a JWT token.
const publicRouter = express.Router();
publicRouter.get("/categories", getActivityCategories);

// router — auth-protected mutation / read endpoints that touch user data
const router = express.Router();
router.post("/set",              setActivity);
router.post("/start",            startActivity);
router.post("/finish",           finishActivity);
router.get("/status/:child_id",  getActivityStatus);
router.get("/history/:child_id", getActivityHistory);

module.exports = { router, publicRouter };