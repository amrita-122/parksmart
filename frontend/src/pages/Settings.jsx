import { useEffect, useState } from "react";
import axios from "axios";

import { API_URL } from "../config";

export default function SettingsPage() {
  const [userData, setUserData] = useState({ name: "", email: "", phoneNumber: "" });
  const [walletBalance, setWalletBalance] = useState(null);
  const [status, setStatus] = useState("");
  const token = localStorage.getItem("token");
  const headers = { Authorization: `Bearer ${token}` };

  useEffect(() => {
    const fetchUserData = async () => {
      try {
        const [profileRes, walletRes] = await Promise.all([
          axios.get(`${API_URL}/app/settings`, { headers }),
          axios.get(`${API_URL}/api/user/wallet`, { headers }),
        ]);
        setUserData({
          name: profileRes.data.name,
          email: profileRes.data.email,
          phoneNumber: profileRes.data.phoneNumber,
        });
        setWalletBalance(walletRes.data.walletBalance);
      } catch (err) {
        console.error("Failed to fetch user:", err);
        setStatus("Failed to load user data.");
      }
    };
    fetchUserData();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps -- load once on mount

  const handleSave = async () => {
    try {
      await axios.put(`${API_URL}/app/settings`, { ...userData }, { headers });
      setStatus("Updated successfully!");
    } catch (err) {
      console.error("Update failed:", err);
      setStatus("Update failed.");
    }
  };

  const handleChange = (e) => {
    setUserData((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  return (
    <div className="p-6 max-w-md mx-auto">
      <h2 className="text-2xl font-bold mb-4">Account Settings</h2>

      {/* Wallet Balance Card */}
      {walletBalance !== null && (
        <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-lg flex items-center justify-between">
          <div>
            <p className="text-sm text-green-700 font-medium">Wallet Balance</p>
            <p className="text-2xl font-bold text-green-800">${walletBalance.toFixed(2)}</p>
          </div>
          <div className="text-green-400 text-3xl">💳</div>
        </div>
      )}

      <label className="block mb-1">Name</label>
      <input
        className="w-full border p-2 mb-4 rounded"
        type="text"
        name="name"
        value={userData.name}
        onChange={handleChange}
      />

      <label className="block mb-1">Email</label>
      <input
        className="w-full border p-2 mb-4 rounded"
        type="email"
        name="email"
        value={userData.email}
        onChange={handleChange}
      />

      <label className="block mb-1">Phone Number</label>
      <input
        className="w-full border p-2 mb-4 rounded"
        type="text"
        name="phoneNumber"
        value={userData.phoneNumber}
        onChange={handleChange}
      />

      <button
        onClick={handleSave}
        className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
      >
        Save Changes
      </button>

      {status && (
        <p className="mt-4 text-sm font-medium text-center text-gray-700">{status}</p>
      )}
    </div>
  );
}
