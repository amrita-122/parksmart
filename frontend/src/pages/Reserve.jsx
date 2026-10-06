import { useEffect, useState } from "react";
import axios from "axios";
import { useNavigate } from "react-router-dom";
import { API_URL } from "../config";

export default function Reserve() {
  const [spots, setSpots] = useState([]);
  const [selectedSpot, setSelectedSpot] = useState("");
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const navigate = useNavigate();
  const token = localStorage.getItem("token");

  useEffect(() => {
    const fetchSpots = async () => {
      try {
        const res = await axios.get(`${API_URL}/api/parking/all`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        setSpots(res.data.filter((s) => s.isAvailable));
      } catch {
        alert("Failed to load spots.");
      }
    };
    fetchSpots();
  }, [token]);

  const handleContinueToPayment = () => {
    if (!selectedSpot || !startTime || !endTime) {
      alert("Please select all fields");
      return;
    }

    const start = new Date(startTime);
    const now = new Date();
    const max = new Date(now.getTime() + 20 * 60 * 1000);
    if (start > max) {
      alert("Reservation must start within 20 minutes from now.");
      return;
    }

    if (new Date(endTime) <= start) {
      alert("End time must be after the start time.");
      return;
    }

    const durationInHours = Math.ceil((new Date(endTime) - start) / (60 * 60 * 1000));
    const amount = durationInHours * 5; // display only; the server computes the real price

    navigate("/payment", {
      state: {
        spotId: selectedSpot,
        startTime,
        endTime,
        amount,
      },
    });
  };

  return (
    <div className="p-6">
      <h2 className="text-2xl font-bold mb-4">Reserve a Parking Spot</h2>

      <label>Available Spots:</label>
      <select
        className="w-full border p-2 mb-4"
        value={selectedSpot}
        onChange={(e) => setSelectedSpot(e.target.value)}
      >
        <option value="">-- Select Spot --</option>
        {spots.map((spot) => (
          <option key={spot._id} value={spot._id}>
            {spot.lotNumber} - {spot.spotNumber}
          </option>
        ))}
      </select>

      <label>Start Time:</label>
      <input
        type="datetime-local"
        className="w-full border p-2 mb-4"
        onChange={(e) => setStartTime(e.target.value)}
      />

      <label>End Time:</label>
      <input
        type="datetime-local"
        className="w-full border p-2 mb-4"
        onChange={(e) => setEndTime(e.target.value)}
      />

      <button
        onClick={handleContinueToPayment}
        className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
      >
        Continue to Payment
      </button>
    </div>
  );
}
