import { useEffect, useState } from "react";
import axios from "axios";
import { API_URL } from "../config";

export default function CheckInOut() {
  const [reservation, setReservation] = useState(null);
  const [status, setStatus] = useState("");
  const token = localStorage.getItem("token");

  useEffect(() => {
    const fetchCurrentReservation = async () => {
      try {
        const res = await axios.get(`${API_URL}/api/user/reservations`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        const active = res.data.find(
          (r) => r.status === "reserved" || r.status === "checked-in"
        );

        if (active) {
          setReservation(active);
          setStatus(active.status);
        } else {
          setReservation(null);
        }
      } catch (err) {
        console.error("Failed to fetch reservation", err);
      }
    };

    fetchCurrentReservation();
  }, []);

  const handleCheckIn = async () => {
    try {
      await axios.post(
        `${API_URL}/api/parking/checkin`,
        { reservationId: reservation._id },
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );
      alert("Checked in successfully!");
      setStatus("checked-in");
    } catch (err) {
      console.error("Check-in failed", err);
      alert("Check-in failed");
    }
  };

  const handleCheckOut = async () => {
    try {
      await axios.post(
        `${API_URL}/api/parking/checkout`,
        { reservationId: reservation._id },
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );
      alert("Checked out successfully!");
      setReservation(null);
    } catch (err) {
      console.error("Check-out failed", err);
      alert("Check-out failed");
    }
  };

  if (!reservation) {
    return <p className="p-6">No active reservation.</p>;
  }

  return (
    <div className="p-6">
      <h2 className="text-2xl font-bold mb-4">Check-In / Check-Out</h2>
      <p>
        Lot: <strong>{reservation.spotId?.lotNumber}</strong>
      </p>
      <p>
        Spot: <strong>{reservation.spotId?.spotNumber}</strong>
      </p>
      <p>
        Status: <strong>{status}</strong>
      </p>

      {status === "reserved" && (
        <button
          onClick={handleCheckIn}
          className="mt-4 bg-purple-600 text-white px-4 py-2 rounded hover:bg-purple-800"
        >
          Check In
        </button>
      )}

      {status === "checked-in" && (
        <button
          onClick={handleCheckOut}
          className="mt-4 bg-gray-800 text-white px-4 py-2 rounded hover:bg-gray-600"
        >
          Check Out
        </button>
      )}
    </div>
  );
}
