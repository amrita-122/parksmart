require("dotenv").config();
const cors = require("cors");
const helmet = require("helmet");
const passport = require("passport");
const express = require("express");
const rateLimit = require("express-rate-limit");
const sanitize = require("./middlewares/sanitize");
require("./config/passport");

const authRoutes = require("./routes/auth");
const parkingRoutes = require("./routes/parkingData");
const settings = require("./routes/settings");
const paymentRoutes = require("./routes/payment");
const reservationRoutes = require("./routes/reservationData");
const adminRoutes = require("./routes/admin");

const app = express();

// Behind a reverse proxy, set TRUST_PROXY to the number of proxy hops so rate
// limits key on the real client IP instead of the proxy's.
if (process.env.TRUST_PROXY) app.set("trust proxy", Number(process.env.TRUST_PROXY));

app.use(helmet());
app.use(cors({ origin: process.env.CLIENT_URL || "http://localhost:5173", credentials: true }));
app.use(express.json({ limit: "10kb" }));
app.use(sanitize);
app.use(passport.initialize());

const makeLimiter = (windowMs, max) =>
  rateLimit({
    windowMs,
    max,
    message: { message: "Too many requests, please try again later." },
    standardHeaders: true,
    legacyHeaders: false,
  });

const authLimiter = makeLimiter(60 * 1000, 20);
const paymentLimiter = makeLimiter(60 * 1000, 30);
const apiLimiter = makeLimiter(15 * 60 * 1000, 600);

app.use(["/api", "/app"], apiLimiter);

app.use("/api/auth", authLimiter, authRoutes);
app.use("/api/parking", parkingRoutes);
app.use("/app/settings", settings);
app.use("/api/payment", paymentLimiter, paymentRoutes);
app.use("/api/user", reservationRoutes);
app.use("/api/admin", adminRoutes);

app.get("/health", (_req, res) => res.json({ status: "ok" }));

module.exports = app;
