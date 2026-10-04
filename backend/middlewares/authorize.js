const crypto = require("crypto");
const User = require("../models/User");

// Use after `authenticate`. Looks the role up in the database instead of
// trusting the JWT, because signup and Google tokens do not carry a role and a
// token keeps its old role until it expires.
const requireAdmin = async (req, res, next) => {
  try {
    const user = await User.findById(req.user.id).select("role");
    if (!user || user.role !== "admin") {
      return res.status(403).json({ message: "Forbidden" });
    }
    next();
  } catch (err) {
    res.status(500).json({ message: "Internal Server Error" });
  }
};

// For machine callers (the Arduino bridge). Fails closed when no key is set.
const requireDeviceKey = (req, res, next) => {
  const expected = process.env.DEVICE_API_KEY;
  if (!expected) {
    return res.status(503).json({ message: "Device API key is not configured" });
  }

  const provided = req.headers["x-device-key"];
  if (typeof provided !== "string") {
    return res.status(401).json({ message: "Device key required" });
  }

  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return res.status(401).json({ message: "Invalid device key" });
  }
  next();
};

// True when the reservation belongs to the authenticated user.
const ownsReservation = (reservation, user) =>
  String(reservation.userId) === String(user.id);

module.exports = { requireAdmin, requireDeviceKey, ownsReservation };
