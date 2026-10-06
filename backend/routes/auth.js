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

// Redirect-based Google login. No express-session, so both legs use session: false.
router.get(
  "/google",
  passport.authenticate("google", { scope: ["profile", "email"], session: false })
);

router.get("/google/callback", (req, res, next) => {
  const clientUrl = process.env.CLIENT_URL || "http://localhost:5173";
  passport.authenticate("google", { session: false }, (err, user) => {
    if (err || !user) return res.redirect(`${clientUrl}/signin`);
    // The token goes in the URL fragment, which browsers never send to servers
    // or include in Referer headers, unlike a query string.
    res.redirect(`${clientUrl}/auth/google/callback#token=${encodeURIComponent(user.token)}`);
  })(req, res, next);
});

router.post("/google", async (req, res) => {
  try {
    const { token } = req.body;
    if (typeof token !== "string" || !token) {
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
