const express = require("express");
const { ParkingSpot, Reservation } = require("../models/parking_db");
const router = express.Router();
const authenticate = require("../middlewares/authenticate");
const { requireAdmin, requireDeviceKey, ownsReservation } = require("../middlewares/authorize");
const { Payment } = require("../models/payments");
const { getIO } = require("../socket");

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

router.post("/reserve", authenticate, async (req, res) => {
  try {
    const { spotId, startTime, endTime } = req.body;
    const userId = req.user.id;
    const spot = await ParkingSpot.findById(spotId);
    if (!spot || !spot.isAvailable) {
      return res.status(400).json({ message: "Spot is not available!" });
    }

    const now = new Date();
    const maxReserveTime = new Date(now.getTime() + 20 * 60 * 1000);
    if (new Date(startTime) > maxReserveTime) {
      return res.status(400).json({ message: "Reservation must be within 20 minutes from now." });
    }

    // One payment pays for one reservation: claim an unused completed payment
    // (reservationId still null) instead of accepting any payment ever made.
    const reservation = new Reservation({ userId, spotId, startTime, endTime, status: "reserved" });
    const payment = await Payment.findOneAndUpdate(
      { userId, amount: { $gt: 0 }, status: "completed", reservationId: null },
      { reservationId: reservation._id },
      { sort: { timestamp: 1 } }
    );
    if (!payment) {
      return res.status(403).json({ message: "Please complete a payment before reserving." });
    }

    try {
      await reservation.save();
    } catch (saveError) {
      // Give the payment back so the user can retry.
      await Payment.findByIdAndUpdate(payment._id, { reservationId: null });
      throw saveError;
    }

    const updatedSpot = await ParkingSpot.findByIdAndUpdate(
      spotId,
      { isAvailable: false, reservedBy: userId },
      { new: true }
    );

    getIO().emit("spot:updated", updatedSpot);

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
    const spot = await ParkingSpot.findOneAndUpdate(
      { spotNumber },
      { isAvailable },
      { new: true }
    );
    if (!spot) return res.status(404).json({ message: "Spot not found" });

    // Broadcast real-time update to all connected clients
    getIO().emit("spot:updated", spot);

    res.json({ success: true, updated: spot });
  } catch (error) {
    res.status(500).json({ message: "Update failed", error: error.message });
  }
});

module.exports = router;
