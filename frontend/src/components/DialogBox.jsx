import { Dialog, DialogBackdrop, DialogPanel, DialogTitle } from '@headlessui/react';
import { InputBox } from './InputBox';
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { API_URL } from "../config";


export const DialogBox = ({ show, onClose,otp, setOtp,name,
    email,
    number,
    password,
}) => {
    const navigate = useNavigate();
    return (
    <Dialog open={show} onClose={onClose} className="relative z-10">
      <DialogBackdrop className="fixed inset-0 bg-gray-500/75 transition-opacity" />

      <div className="fixed inset-0 z-10 w-screen overflow-y-auto">
        <div className="flex min-h-full items-center justify-center p-4 text-center">
          <DialogPanel className="relative transform overflow-hidden rounded-lg bg-white text-left shadow-xl sm:my-8 sm:w-full sm:max-w-lg">
            <div className="bg-white px-4 pt-5 pb-4">
              <DialogTitle as="h3" className="text-base font-semibold text-gray-900">
                OTP Sent
              </DialogTitle>
              <div className="mt-2">
                <p className="text-sm text-gray-500">
                  Enter the OTP sent to your phone number.
                </p>
              </div>
              <InputBox label={""} placeholder={"OTP"} onChange={(e) => setOtp(e.target.value)} value={otp} />
            </div>
            <div className="bg-gray-50 px-4 py-3 sm:flex sm:flex-row-reverse">
              <button
                type="button"
                onClick={onClose}
                className="inline-flex justify-center rounded-md bg-red-600 px-3 py-2 text-sm font-semibold text-white hover:bg-red-500"
              >
                Close
              </button>
              <button
                type="button"
                onClick={async () => {
                    try {
                      const response = await axios.post(
                        `${API_URL}/api/auth/signup`,
                        {
                          name,
                          email,
                          phoneNumber: number,
                          password,
                          otp
                        }
                      );
                      localStorage.setItem("token", response.data.token);
                      console.log(response.data.token)
                      navigate("/");
                    } catch (error) {
                      console.error(
                        "Signup Error:",
                        error.response?.data || error.message
                      );
                      alert(
                        "Signup failed! " +
                          (error.response?.data?.message || "Please try again.")
                      );
                    }
                  }}

                className="inline-flex justify-center rounded-md bg-grey-200 px-3 py-2 text-sm font-semibold text-black me-2 hover:border-black border-2"
              >
                Verify
              </button>
            </div>
          </DialogPanel>
        </div>
      </div>
    </Dialog>
  );
};
