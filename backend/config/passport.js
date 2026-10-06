require('dotenv').config()
const passport = require('passport')
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const { verifyGoogleProfile } = require('./googleVerify');

passport.use(
  new GoogleStrategy(
    {
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      // Must match an "Authorized redirect URI" in the Google console. Relative
      // paths are resolved against the request host (set TRUST_PROXY behind a proxy).
      callbackURL: process.env.GOOGLE_CALLBACK_URL || '/api/auth/google/callback',
      proxy: !!process.env.TRUST_PROXY,
    },
    verifyGoogleProfile
  )
)
