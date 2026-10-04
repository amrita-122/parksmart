require('dotenv').config()
const passport = require('passport')
const GoogleStrategy= require('passport-google-oauth20').Strategy;
const { signToken } = require('../utils/token');
const User = require('../models/User');


passport.use(
   new GoogleStrategy(
    {
        clientID : process.env.GOOGLE_CLIENT_ID,
        clientSecret : process.env.GOOGLE_CLIENT_SECRET,
        callbackURL : 'api/auth/google/callback',
        scope: ['profile','email'],
    },
    async ( done, profile) =>{
       try {
        let user = await User.findOne({email:profile.emails[0].value});

        if (!user){
            user = new User({
                email: profile.emails[0].value,
                name: profile.displayName,
                password:null,
                phoneNumber:null,
                role: "user"
            })
            await user.save();
        }

        const token = signToken(
            { id: user._id, email: user.email, role: user.role }
          );

          return done(null, { ...user.toObject(), token });
            }catch(error){
            return  done(error,null)
        }


    }
   )

)
passport.serializeUser((user,done) =>{
    done(null,user)
})

passport.deserializeUser((user, done) => {
    done(null, user);
  });