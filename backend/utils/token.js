const jwt = require("jsonwebtoken");

// Every JWT the API issues goes through here so they all expire.
// Override the lifetime with JWT_EXPIRES_IN (e.g. "1h", "7d").
const signToken = (payload) =>
  jwt.sign(payload, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || "1d",
  });

module.exports = { signToken };
