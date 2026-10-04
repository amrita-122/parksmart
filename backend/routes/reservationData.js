const express = require("express");
const router = express.Router();
const { Reservation, ParkingSpot } = require("../models/parking_db");
const authenticate = require("../middlewares/authenticate");
const { Payment } = require("../models/payments");
const User = require("../models/User");

const RATE_PER_HOUR = 5; // $5/hr — matches frontend pricing

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

// Reserve a parking spot
router.post("/reserve", async (req, res) => {
  try {
    const { userId, spotId, startTime, endTime } = req.body;

    const spot = await ParkingSpot.findById(spotId);
    if (!spot || !spot.isAvailable) {
      return res.status(400).json({ error: "Spot not available" });
    }

    const reservation = new Reservation({ userId, spotId, startTime, endTime });
    await reservation.save();

    await ParkingSpot.findByIdAndUpdate(spotId, { isAvailable: false, reservedBy: userId });

    res.status(201).json({ message: "Reservation successful", reservation });
  } catch (error) {
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// Cancel reservation
router.delete("/cancel/:id", async (req, res) => {
  try {
    const reservation = await Reservation.findById(req.params.id);
    if (!reservation) {
      return res.status(404).json({ error: "Reservation not found" });
    }

    await ParkingSpot.findByIdAndUpdate(reservation.spotId, { isAvailable: true, reservedBy: null });
    await Reservation.findByIdAndDelete(req.params.id);

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

    const now = new Date();
    const endTime = new Date(reservation.endTime);
    let walletCredit = 0;

    if (now < endTime) {
      const unusedMinutes = (endTime - now) / (1000 * 60);
      walletCredit = parseFloat(((unusedMinutes / 60) * RATE_PER_HOUR).toFixed(2));
    }

    reservation.status = "completed";
    await reservation.save();

    await ParkingSpot.findByIdAndUpdate(reservation.spotId, {
      isAvailable: true,
      reservedBy: null,
    });

    if (walletCredit > 0) {
      await User.findByIdAndUpdate(req.user.id, { $inc: { walletBalance: walletCredit } });
    }

    res.status(200).json({
      message: "Checked out successfully!",
      walletCredit,
    });
  } catch (error) {
    res.status(500).json({ message: "Internal Server Error", error: error.message });
  }
});

module.exports = router;
