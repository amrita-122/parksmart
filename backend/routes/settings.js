const express = require("express");
const router = express.Router();
const User = require("../models/User");
const authenticate = require("../middlewares/authenticate");
const { isEmail } = require("../utils/validate");

// Mounted at /app/settings in app.js, so these are GET/PUT /app/settings.

// GET route to fetch user info (never includes the password hash)
router.get("/", authenticate, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select("-password");
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }
    res.json(user);
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

// PUT route to update user info. Only these three fields can change;
// role, walletBalance and password are never taken from the body.
router.put("/", authenticate, async (req, res) => {
  try {
    const { name, email, phoneNumber } = req.body;

    if (phoneNumber && !/^[0-9]{10}$/.test(phoneNumber)) {
      return res.status(400).json({ message: "Invalid phone number" });
    }

    if (email !== undefined && email !== "" && !isEmail(typeof email === "string" ? email.trim() : email)) {
      return res.status(400).json({ message: "Invalid email" });
    }

    const updates = {};
    if (typeof name === "string" && name.trim()) updates.name = name.trim();
    if (typeof email === "string" && email.trim()) updates.email = email.trim().toLowerCase();
    if (phoneNumber) updates.phoneNumber = phoneNumber;

    const updatedUser = await User.findByIdAndUpdate(req.user.id, updates, {
      new: true,
    }).select("-password");

    if (!updatedUser) {
      return res.status(404).json({ message: "User not found" });
    }
    res.json(updatedUser);
  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).json({ message: "Email or phone number already in use" });
    }
    res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;
