import { useState } from "react";
import { BottomWarning } from "../components/BottomWarning";
import { Button } from "../components/Button";
import { InputBox } from "../components/InputBox";
import { Subheading } from "../components/SubHeading";
import { Heading } from "../components/heading";
import axios from "axios";
import { GoogleLogin } from "@react-oauth/google";
import { DialogBox } from "../components/DialogBox";

const handleGoogleLogin = async (response) => {
  try {
    const res = await axios.post("http://localhost:3000/api/auth/google", {
      token: response.credential
    });

    localStorage.setItem("token", res.data.token);
    window.location.href = "/";
  } catch (error) {
    console.error("Google Login Error:", error.response?.data || error.message);
    alert("Signup Failed",error.message)
  }
};




export const SignUp = () => {

const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [number, setNumber] = useState("");
  const [showDialog, setShowDialog] = useState(false)
  const [otp, setOtp] = useState("");
  return (
    <div className="bg-gray-100 h-screen flex justify-center">
      <div className="flex flex-col justify-center">
        <div className="rounded-lg bg-white w-80 text-center p-2 h-max px-4">
          <Heading label={"Sign Up"} />
          <Subheading label={"Enter Your credentials to create your account"} />
          <InputBox
            label={"Name"}
            placeholder={"Selmon Bhoi"}
            onChange={(e) => {
              setName(e.target.value.toLowerCase());
            }}
          />
          <InputBox
            label={"Email"}
            placeholder={"abc@gmail.com"}
            onChange={(e) => {
              setEmail(e.target.value.toLowerCase());
            }}
          />
          <InputBox
            label={"number"}
            placeholder={"1234567890"}
            onChange={(e) => {
              setNumber(e.target.value.toLowerCase());
            }}
          />
          <InputBox
            label={"Password"}
            placeholder={"*******"}
            onChange={(e) => {
              setPassword(e.target.value.toLowerCase());
            }}
          />
          <div className="pt-4">

            <GoogleLogin
              onSuccess={handleGoogleLogin}
              onError={() => {}}
            />
            <Button
  label={"Send OTP"}
  onClick={
    async () => {
      try{
    const response = await axios.post(
      "http://localhost:3000/api/auth/sendotp",
      {
        name,
        password,
        phoneNumber:number,
        email
      }
    );
    console.log(response)
    setShowDialog(true)
  }catch(error){
    console.error(
      "Signup Error:",
      error.response?.data || error.message
  );
  alert(
   "Signup failed! " +
  (error.response?.data?.message || "Please try again.")
  );
  }
  } }
/>
          </div>
          <BottomWarning
            label={"Already have an account?"}
            buttonText={"Sign In"}
            to={"/SignIn"}
          />
          <DialogBox show={showDialog} onClose={() => setShowDialog(false)} otp={otp} setOtp={setOtp}  name={name}
          email={email}
          number={number}
          password={password} />
</div>
      </div>
    </div>
  );
};
