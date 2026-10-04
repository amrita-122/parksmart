const express=require("express");
const { signToken } = require("../utils/token");
const User = require("../models/User");
const router = express.Router();
const passport = require("passport");
const authControllers = require("../controllers/authControllers")
const otpcontrollers =  require("../controllers/otpControllers")

router.post("/signup", authControllers.signup)
router.post("/sendotp",otpcontrollers.sendOTP );
router.post("/login",authControllers.login );

router.get(
  "/google",
  passport.authenticate("google", { scope: ["profile", "email"] })
);

router.get(
  "/google/callback",
  passport.authenticate("google", { failureRedirect: "/login" }),
  (req, res) => {
    const clientUrl = process.env.CLIENT_URL || "http://localhost:5173";
    res.redirect(`${clientUrl}/?token=${req.user.token}`);
  }
);

router.post("/google", async (req, res) => {
  try {
    const { token } = req.body;
    if (!token) {
      return res.status(400).json({ error: "Token is required" });
    }

    const { OAuth2Client } = require("google-auth-library");
    const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

    try {
      const ticket = await client.verifyIdToken({
        idToken: token,
        audience: process.env.GOOGLE_CLIENT_ID,
        options: {
          ignoreExpiration: false,
          maxExpiry: 5 * 60,
        },
      });

      const payload = ticket.getPayload();
      const email = payload.email;
      const name = payload.name;

      let user = await User.findOne({ email });

      if (!user) {
        user = new User({
          email,
          name,
          provider: "google",
          password: null,
          role: "user",
        });
        await user.save();
      }
      const jwtToken = signToken({ id: user._id, email: user.email, role: user.role });

      // Never send the password hash back: a local account that signs in with
      // Google would otherwise leak it here.
      const { password, ...safeUser } = user.toObject();
      res.json({ token: jwtToken, user: safeUser });
    } catch (verifyError) {
      return res.status(401).json({ error: "Invalid token" });
    }
  } catch (error) {
    res.status(500).json({ error: "Failed to authenticate user" });
  }
});

module.exports = router;
