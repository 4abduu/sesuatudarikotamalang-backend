const express = require("express");
const { requireAuth } = require("../middleware/auth");
const upload = require("../lib/upload");
const uploadController = require("../controllers/upload.controller");

const router = express.Router();

// POST /api/upload/single — Upload 1 file (membutuhkan login)
router.post(
  "/single",
  requireAuth,
  (req, res, next) => {
    upload.single("file")(req, res, (err) => {
      if (err) {
        return res.status(400).json({ error: err.message });
      }
      next();
    });
  },
  uploadController.uploadSingle
);

// POST /api/upload/multiple — Upload hingga 5 file sekaligus (membutuhkan login)
router.post(
  "/multiple",
  requireAuth,
  (req, res, next) => {
    upload.array("files", 5)(req, res, (err) => {
      if (err) {
        return res.status(400).json({ error: err.message });
      }
      next();
    });
  },
  uploadController.uploadMultiple
);

module.exports = router;
