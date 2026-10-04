const otpGenerator = require('otp-generator');
const OTP = require('../models/OtpModel');
const User = require('../models/User');
const mailSender = require("../utils/mailSender")
const { isString, isEmail, isPhone } = require("../utils/validate");

exports.sendOTP = async (req, res) => {
  try {
    const { name,email,password,phoneNumber } = req.body;
    if (!isString(name) || !isEmail(email) || !isPhone(phoneNumber) || !isString(password, 72)) {
      return res.status(400).json({
        success: false,
        message: 'Please enter the details correctly',
      });
    }
    const checkUserPresent = await User.findOne({ email });
    if (checkUserPresent) {
      return res.status(401).json({
        success: false,
        message: 'User is already registered',
      });
    }
    if(!email || !name || !phoneNumber || !password){
      return res.status(401).json({
            success: false,
            message: 'Please enter the details correctly',
    })
}

    let otp = otpGenerator.generate(6, {
      upperCaseAlphabets: false,
      lowerCaseAlphabets: false,
      specialChars: false,
    });
    let result = await OTP.findOne({ otp: otp });
    while (result) {
      otp = otpGenerator.generate(6, {
        upperCaseAlphabets: false,
      });
      result = await OTP.findOne({ otp: otp });
    }
    const otpPayload = { email, otp };
    await OTP.create(otpPayload);
    const sent = await mailSender(email, "Your OTP Code", `<h2>Your OTP is: ${otp}</h2>`);
    if (!sent) {
      await OTP.deleteMany({ email });
      return res.status(502).json({ success: false, message: 'Could not send the OTP email' });
    }

    // The OTP is only ever delivered by email. Returning it here would let anyone
    // "verify" an address they do not own.
    res.status(200).json({
      success: true,
      message: 'OTP sent successfully',
    });
  } catch (error) {
    console.log(error.message);
    return res.status(500).json({ success: false, error: error.message });
  }
};