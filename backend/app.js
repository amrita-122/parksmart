require("dotenv").config();
const cors = require("cors");
const passport = require("passport");
const express = require("express");
const rateLimit = require("express-rate-limit");
require("./config/passport");

const authRoutes = require("./routes/auth");
const parkingRoutes = require("./routes/parkingData");
const settings = require("./routes/settings");
const paymentRoutes = require("./routes/payment");
const reservationRoutes = require("./routes/reservationData");
const adminRoutes = require("./routes/admin");

const app = express();

app.use(cors({ origin: process.env.CLIENT_URL || "http://localhost:5173", credentials: true }));
app.use(express.json());
app.use(passport.initialize());

const authLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  message: { message: "Too many requests, please try again later." },
  standardHeaders: true,
  legacyHeaders: false,
});

app.use("/api/auth", authLimiter, authRoutes);
app.use("/api/parking", parkingRoutes);
app.use("/app/settings", settings);
app.use("/api/payment", paymentRoutes);
app.use("/api/user", reservationRoutes);
app.use("/api/admin", adminRoutes);

app.get("/health", (_req, res) => res.json({ status: "ok" }));

module.exports = app;
