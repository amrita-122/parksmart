const { signToken } = require("../utils/token");
const User = require("../models/User");

// passport-google-oauth20 verify callback: (accessToken, refreshToken, profile, done).
// Finds or creates the user for the Google profile and hands passport a user
// carrying a signed JWT (never the password hash).
const verifyGoogleProfile = async (_accessToken, _refreshToken, profile, done) => {
  try {
    const email = profile.emails?.[0]?.value;
    if (!email) return done(null, false);

    let user = await User.findOne({ email });
    if (!user) {
      // No phoneNumber: Google users do not have one, and the schema only
      // requires it for local accounts.
      user = new User({
        email,
        name: profile.displayName,
        provider: "google",
        password: null,
        role: "user",
      });
      await user.save();
    }

    const token = signToken({ id: user._id, email: user.email, role: user.role });
    return done(null, { id: user._id, email: user.email, role: user.role, token });
  } catch (error) {
    return done(error, null);
  }
};

module.exports = { verifyGoogleProfile };
