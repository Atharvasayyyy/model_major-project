const express = require("express");
const {
  createChild,
  getChildren,
  getChildById,
  updateChild,
  deleteChild,
} = require("../controllers/childrenController");

const router = express.Router();

router.post("/", createChild);
router.get("/", getChildren);
router.get("/:id", getChildById);
router.put("/:id", updateChild);
router.delete("/:id", deleteChild);

module.exports = router;
