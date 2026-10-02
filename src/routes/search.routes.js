const express = require("express");
const searchController = require("../controllers/search.controller");

const router = express.Router();

// GET /api/search — Search produk & kreator
router.get("/", searchController.search);

module.exports = router;
