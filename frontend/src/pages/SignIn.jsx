import { useState } from "react";
import { BottomWarning } from "../components/BottomWarning";
import { Button } from "../components/Button";
import { InputBox } from "../components/InputBox";
import { Subheading } from "../components/SubHeading";
import { Heading } from "../components/heading";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { GoogleLogin } from "@react-oauth/google";
import { API_URL } from "../config";

const handleSignIn = (email, pass, navigate) => {
  return async () => {
    console.log('Email:', email, 'Password:', pass);
    try {
      const response = await axios.post(`${API_URL}/api/auth/login`, {
        emailorPhone: email,
        password: pass,
      });

      if (response.status === 200) {
        localStorage.setItem("token", response.data.token);
        navigate("/");
      }
    } catch (error) {
      console.error("Login failed:", error.response?.data || error.message);
      alert(error.response?.data?.message || "Login failed! Please try again.");
    }
  };
};

const handleGoogleLogin =async (response) =>{
  try{
    const res  = await axios.post(`${API_URL}/api/auth/google`,{
    token:response.credential,
  })
  localStorage.setItem("token", res.data.token);
    window.location.href = "/";

}catch(error){
  console.error("Google Login Error:", error.response?.data || error.message);
    alert("Login Failed",error.message)
}
}
export const SignIn = () => {
  const navigate = useNavigate(); // to navigate after login
  const [email, setEmail] = useState("");
  const [pass, setPass] = useState("");

  return (
    <div className="bg-slate-300 h-screen flex justify-center">
      <div className="flex flex-col justify-center">
        <div className="rounded-lg bg-white w-80 text-center p-2 h-max px-4">
          <Heading label={"Sign In"} />
          <Subheading label={"Enter Your credentials to access your account"} />
          <InputBox
            label={"Email"}
            placeholder={"abc@gmail.com"}
            onChange={(e) => {
              setEmail(e.target.value.toLowerCase());
            }}
          />
          <InputBox
            label={"Password"}
            placeholder={"*******"}
            onChange={(e) => {
              setPass(e.target.value.toLowerCase());
            }}
          />
          <div className="pt-4">
            <Button
              label={"Sign In"}
              onClick={() => handleSignIn(email, pass, navigate)()} // Fixing the invocation
            />
            <GoogleLogin onSuccess={handleGoogleLogin}/>
          </div>
          <BottomWarning
            label={"Don't have an account?"}
            buttonText={"Sign Up"}
            to={"/SignUp"}
          />
        </div>
      </div>
    </div>
  );
};
