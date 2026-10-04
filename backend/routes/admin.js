// routes/admin.js
const express = require("express");
const { Reservation } = require("../models/parking_db");
const { Payment } = require('../models/payments')
const router = express.Router();
const authenticate = require("../middlewares/authenticate");
const { requireAdmin } = require("../middlewares/authorize");

router.get("/reservations", authenticate, requireAdmin, async (req, res) => {
  try {
    const reservations = await Reservation.find()
      .populate("userId", "-password")
      .populate("spotId");
    res.json(reservations);
  } catch (err) {
    res.status(500).json({ message: "Internal Server Error" });
  }
});

router.get("/payments", authenticate, requireAdmin, async (req, res) => {
  try {
    const payments = await Payment.find()
      .populate("userId", "-password")
      .populate("reservationId");
    res.json(payments);
  } catch (err) {
    res.status(500).json({ message: "Internal Server Error" });
  }
});

module.exports = router;
