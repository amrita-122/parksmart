const express = require("express");
const { ParkingSpot, Reservation } = require("../models/parking_db");
const router = express.Router();
const authenticate = require("../middlewares/authenticate");
const { requireAdmin, requireDeviceKey, ownsReservation } = require("../middlewares/authorize");
const { Payment } = require("../models/payments");
const User = require("../models/User");
const { getIO } = require("../socket");
const { priceForDuration } = require("../utils/pricing");

router.post("/add", authenticate, requireAdmin, async (req, res) => {
  try {
    const { lotNumber, spotNumber, lat, lng } = req.body;
    if (!lotNumber || !spotNumber || !lat || !lng) {
      return res.status(400).json({ message: "All fields are required" });
    }
    if (!Number.isFinite(parseFloat(lat)) || !Number.isFinite(parseFloat(lng))) {
      return res.status(400).json({ message: "lat and lng must be numbers" });
    }

    const existingSpot = await ParkingSpot.findOne({ spotNumber });
    if (existingSpot) {
      return res.status(400).json({ message: "Spot already exists!" });
    }

    const newSpot = new ParkingSpot({
      lotNumber,
      spotNumber,
      lat: parseFloat(lat),
      lng: parseFloat(lng),
    });

    await newSpot.save();
    res.status(201).json({ message: "Parking spot added!", spot: newSpot });
  } catch (error) {
    console.error("Spot Add Error:", error.message);
    res.status(500).json({ message: "Internal Server Error", error: error.message });
  }
});

router.delete("/delete/:id", authenticate, requireAdmin, async (req, res) => {
  try {
    const deleted = await ParkingSpot.findByIdAndDelete(req.params.id);
    if (!deleted) return res.status(404).json({ message: "Spot not found" });
    res.json({ message: "Spot deleted" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/all", async (_req, res) => {
  try {
    const spots = await ParkingSpot.find();
    res.status(200).json(spots);
  } catch (error) {
    res.status(500).json({ message: "Internal Server Error", error: error.message });
  }
});

const START_GRACE_MS = 10 * 60 * 1000;

router.post("/reserve", authenticate, async (req, res) => {
  try {
    const { spotId, startTime, endTime, useWallet } = req.body;
    const userId = req.user.id;

    const start = new Date(startTime);
    const end = new Date(endTime);
    if (!startTime || !endTime || isNaN(start) || isNaN(end)) {
      return res.status(400).json({ message: "startTime and endTime must be valid dates." });
    }
    if (end <= start) {
      return res.status(400).json({ message: "endTime must be after startTime." });
    }

    const now = new Date();
    // The user picks the time, then pays, then reserves, so allow a short grace window.
    const earliestStart = new Date(now.getTime() - START_GRACE_MS);
    if (start < earliestStart) {
      return res.status(400).json({ message: "startTime cannot be in the past." });
    }
    const maxReserveTime = new Date(now.getTime() + 20 * 60 * 1000);
    if (start > maxReserveTime) {
      return res.status(400).json({ message: "Reservation must be within 20 minutes from now." });
    }

    // Claim the spot with one conditional write so only one request can win.
    const claimedSpot = await ParkingSpot.findOneAndUpdate(
      { _id: spotId, isAvailable: true },
      { isAvailable: false, reservedBy: userId },
      { new: true }
    );
    if (!claimedSpot) {
      return res.status(400).json({ message: "Spot is not available!" });
    }
    // Only frees the spot if this user still holds it.
    const releaseSpot = () =>
      ParkingSpot.findOneAndUpdate(
        { _id: spotId, reservedBy: userId },
        { isAvailable: true, reservedBy: null }
      );

    // One payment pays for one reservation: claim an unused completed payment
    // (reservationId still null) whose amount matches the booked duration.
    const price = priceForDuration(start, end);
    const reservation = new Reservation({ userId, spotId, startTime, endTime, status: "reserved" });

    // `refund` undoes whichever payment source was taken if saving fails.
    let refund;
    if (useWallet === true) {
      // The debit is one conditional write, so the balance can never go negative.
      const debited = await User.findOneAndUpdate(
        { _id: userId, walletBalance: { $gte: price } },
        { $inc: { walletBalance: -price } }
      );
      if (!debited) {
        await releaseSpot();
        return res.status(402).json({ message: "Insufficient wallet balance." });
      }
      refund = () => User.findByIdAndUpdate(userId, { $inc: { walletBalance: price } });
    } else {
      const payment = await Payment.findOneAndUpdate(
        { userId, amount: price, status: "completed", reservationId: null },
        { reservationId: reservation._id },
        { sort: { timestamp: 1 } }
      );
      if (!payment) {
        await releaseSpot();
        return res.status(403).json({ message: "Please complete a payment for this booking before reserving." });
      }
      refund = () => Payment.findByIdAndUpdate(payment._id, { reservationId: null });
    }

    try {
      await reservation.save();
    } catch (saveError) {
      // Give the payment (or wallet balance) and the spot back so the user can retry.
      await refund();
      await releaseSpot();
      throw saveError;
    }

    if (useWallet === true) {
      // Keep the wallet spend visible in payment history.
      try {
        await new Payment({
          userId,
          reservationId: reservation._id,
          amount: price,
          paymentMethod: "wallet",
          transactionId: `wallet_${reservation._id}`,
          status: "completed",
        }).save();
      } catch (recordError) {
        console.error("Wallet payment record failed:", recordError.message);
      }
    }

    getIO().emit("spot:updated", claimedSpot);

    res.status(201).json({ message: "Spot reserved successfully!", reservation });
  } catch (error) {
    res.status(500).json({ message: "Internal Server Error", error: error.message });
  }
});

router.post("/checkin", authenticate, async (req, res) => {
  try {
    const { reservationId } = req.body;
    const reservation = await Reservation.findById(reservationId);

    if (!reservation || reservation.status !== "reserved") {
      return res.status(400).json({ message: "Invalid reservation!" });
    }
    if (!ownsReservation(reservation, req.user)) {
      return res.status(403).json({ message: "Forbidden" });
    }

    reservation.status = "checked-in";
    await reservation.save();

    res.status(200).json({ message: "Checked in successfully!", reservation });
  } catch (error) {
    res.status(500).json({ message: "Internal Server Error", error: error.message });
  }
});

router.post("/checkout", authenticate, async (req, res) => {
  try {
    const { reservationId } = req.body;
    const reservation = await Reservation.findById(reservationId);

    if (!reservation || reservation.status !== "checked-in") {
      return res.status(400).json({ message: "Invalid reservation!" });
    }
    if (!ownsReservation(reservation, req.user)) {
      return res.status(403).json({ message: "Forbidden" });
    }

    reservation.status = "completed";
    await reservation.save();

    const updatedSpot = await ParkingSpot.findByIdAndUpdate(
      reservation.spotId,
      { isAvailable: true, reservedBy: null },
      { new: true }
    );

    getIO().emit("spot:updated", updatedSpot);

    res.status(200).json({ message: "Checked out successfully!" });
  } catch (error) {
    res.status(500).json({ message: "Internal Server Error", error: error.message });
  }
});

router.get("/nearest", authenticate, async (req, res) => {
  const { lat, lng } = req.query;
  if (!lat || !lng) return res.status(400).json({ message: "Missing coordinates" });

  const spots = await ParkingSpot.find({ isAvailable: true });
  if (!spots.length) return res.status(404).json({ message: "No spots available" });

  const userLat = parseFloat(lat);
  const userLng = parseFloat(lng);

  const nearest = spots.reduce((closest, spot) => {
    const d1 = Math.sqrt((spot.lat - userLat) ** 2 + (spot.lng - userLng) ** 2);
    const d2 = Math.sqrt((closest.lat - userLat) ** 2 + (closest.lng - userLng) ** 2);
    return d1 < d2 ? spot : closest;
  });

  res.json(nearest);
});

router.get("/nearby", async (req, res) => {
  const { lat, lng, radius = 0.5 } = req.query;
  const latNum = parseFloat(lat);
  const lngNum = parseFloat(lng);

  if (!latNum || !lngNum) return res.status(400).json({ message: "Missing lat/lng" });

  const delta = parseFloat(radius) * 0.009;
  const spots = await ParkingSpot.find({
    lat: { $gte: latNum - delta, $lte: latNum + delta },
    lng: { $gte: lngNum - delta, $lte: lngNum + delta },
  });

  res.json(spots);
});

router.post("/update-status", requireDeviceKey, async (req, res) => {
  const { spotNumber, isAvailable } = req.body;

  if (!spotNumber || typeof isAvailable !== "boolean") {
    return res.status(400).json({ message: "Invalid data" });
  }

  try {
    // A sensor "available" report must not free a spot someone has reserved.
    const filter = isAvailable ? { spotNumber, reservedBy: null } : { spotNumber };
    const spot = await ParkingSpot.findOneAndUpdate(filter, { isAvailable }, { new: true });
    if (!spot) {
      if (await ParkingSpot.exists({ spotNumber })) {
        return res.json({ success: true, ignored: true, reason: "Spot is reserved" });
      }
      return res.status(404).json({ message: "Spot not found" });
    }

    // Broadcast real-time update to all connected clients
    getIO().emit("spot:updated", spot);

    res.json({ success: true, updated: spot });
  } catch (error) {
    res.status(500).json({ message: "Update failed", error: error.message });
  }
});

module.exports = router;
