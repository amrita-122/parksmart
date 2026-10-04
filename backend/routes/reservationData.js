const express = require("express");
const router = express.Router();
const { Reservation, ParkingSpot } = require("../models/parking_db");
const authenticate = require("../middlewares/authenticate");
const { ownsReservation } = require("../middlewares/authorize");
const { Payment } = require("../models/payments");
const User = require("../models/User");
const { getIO } = require("../socket");

const { completeWithCredit } = require("../utils/checkoutCredit");

router.get("/reservations", authenticate, async (req, res) => {
  try {
    const reservations = await Reservation.find({ userId: req.user.id }).populate("spotId");
    res.status(200).json(reservations);
  } catch (err) {
    res.status(500).json({ message: "Failed to fetch reservations" });
  }
});

router.get("/payments", authenticate, async (req, res) => {
  const payments = await Payment.find({ userId: req.user.id });
  res.json(payments);
});

// Get wallet balance
router.get("/wallet", authenticate, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select("walletBalance");
    res.json({ walletBalance: user.walletBalance });
  } catch (err) {
    res.status(500).json({ message: "Failed to fetch wallet balance" });
  }
});

// Reserving lives in POST /api/parking/reserve (authenticated, payment-checked).
// The old unauthenticated POST /api/user/reserve took a userId from the body and
// skipped the payment check, so it was removed.

// Cancel reservation
router.delete("/cancel/:id", authenticate, async (req, res) => {
  try {
    const reservation = await Reservation.findById(req.params.id);
    if (!reservation) {
      return res.status(404).json({ error: "Reservation not found" });
    }
    if (!ownsReservation(reservation, req.user)) {
      return res.status(403).json({ error: "Forbidden" });
    }
    if (reservation.status !== "reserved") {
      return res.status(400).json({ error: "Only a reservation that has not been checked in can be cancelled" });
    }

    // Keep the record (status "cancelled") so history and the admin view still show it.
    reservation.status = "cancelled";
    await reservation.save();

    const freedSpot = await ParkingSpot.findByIdAndUpdate(
      reservation.spotId,
      { isAvailable: true, reservedBy: null, occupiedBy: null },
      { new: true }
    );
    getIO().emit("spot:updated", freedSpot);

    res.json({ message: "Reservation cancelled" });
  } catch (error) {
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// Checkout with unused-time wallet credit
router.post("/checkout-credit", authenticate, async (req, res) => {
  try {
    const { reservationId } = req.body;
    const reservation = await Reservation.findById(reservationId);

    if (!reservation || reservation.status !== "checked-in") {
      return res.status(400).json({ message: "Invalid reservation!" });
    }
    if (!ownsReservation(reservation, req.user)) {
      return res.status(403).json({ message: "Forbidden" });
    }

    const result = await completeWithCredit(reservation);
    if (!result) {
      return res.status(400).json({ message: "Invalid reservation!" });
    }

    res.status(200).json({
      message: "Checked out successfully!",
      walletCredit: result.walletCredit,
    });
  } catch (error) {
    res.status(500).json({ message: "Internal Server Error", error: error.message });
  }
});

module.exports = router;
