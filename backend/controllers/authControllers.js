const bcrypt = require('bcryptjs');
const User = require('../models/User');
const OTP = require('../models/OtpModel');
const { signToken } = require('../utils/token');
const { isString, isEmail, isPhone } = require('../utils/validate');

exports.signup = async (req, res) => {
    try{
    const name = req.body.name;
    const email = req.body.email;
    const phoneNumber = req.body.phoneNumber;
    const password = req.body.password;
    const otp = req.body.otp

    if (!isString(name) || !isEmail(email) || !isPhone(phoneNumber) || !isString(password, 72) || !isString(otp, 12)) {
        return res.status(400).json({ message: "Name, a valid email, a 10-digit phone number, a password (up to 72 characters) and the OTP are required" });
    }

    const user = await User.findOne({ email });
    if (user){
        return res.status(409).json({ message : "Email already Exists!"})
    }
    const response = await OTP.find({ email }).sort({ createdAt: -1 }).limit(1);
    if (response.length === 0 || otp !== response[0].otp) {
      return res.status(400).json({
        success: false,
        message: 'The OTP is not valid',
      });
    }
        const hashedPass = await bcrypt.hash(password,10)
        const user1 = new User({name:name,email:email,phoneNumber:phoneNumber,password:hashedPass})
        await user1.save();
        // An OTP is single-use.
        await OTP.deleteMany({ email });
        const token = signToken({ id: user1._id, email: user1.email, role: user1.role });
        res.status(201).json({ message: "User Created Successfully!", token });
        console.log("User created")
}catch(error){
    res.status(500).json({ message: "Internal Server Error", error: error.message });
}
}

exports.login = async (req,res)=>{
    try{
     const {emailorPhone,password} = req.body;
     if (!isString(emailorPhone) || !isString(password, 72)) {
         return res.status(400).json({ message: "Email/Phone and password are required!" });
       }
      const user = await User.findOne({
       $or: [{ email: emailorPhone }, { phoneNumber: emailorPhone }],
     });
 
     // Same answer for "no such user", "Google-only account" and "wrong password"
     // so the endpoint can't be used to find out which emails are registered.
     const isMatch = user && user.password
       ? await bcrypt.compare(password, user.password)
       : false;

     if (!isMatch){
         return res.status(401).json({message : 'Invalid credentials'})
     }

     const token = signToken({id:user._id, email:user.email, role: user.role})
     res.status(200).json({ message: "Login Successful!", token });
 
 } catch (error) {
     res.status(500).json({ message: "Internal Server Error", error: error.message });
 }
 };