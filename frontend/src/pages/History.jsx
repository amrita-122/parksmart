import { useEffect, useState } from "react";
import axios from "axios";
import { API_URL } from "../config";

export default function History() {
  const [reservations, setReservations] = useState([]);
  const [payments, setPayments] = useState([]);
  const token = localStorage.getItem("token");

  useEffect(() => {
    const fetchHistory = async () => {
      try {
        const [res1, res2] = await Promise.all([
          axios.get(`${API_URL}/api/user/reservations`, {
            headers: { Authorization: `Bearer ${token}` },
          }),
          axios.get(`${API_URL}/api/user/payments`, {
            headers: { Authorization: `Bearer ${token}` },
          }),
        ]);

        setReservations(res1.data);
        setPayments(res2.data);
      } catch (err) {
        console.error("Failed to fetch history", err);
      }
    };
    fetchHistory();
  }, [token]);

  return (
    <div className="p-6">
      <h2 className="text-2xl font-bold mb-4">Reservation History</h2>
      {reservations.length === 0 ? (
        <p>No reservations found.</p>
      ) : (
        <ul className="mb-8">
          {reservations.map((res) => (
            <li key={res._id} className="mb-3 p-3 border rounded">
              <p>
                <strong>Spot:</strong> {res.spotId?.spotNumber} |{" "}
                <strong>Status:</strong> {res.status}
              </p>
              <p>
                <strong>From:</strong>{" "}
                {new Date(res.startTime).toLocaleString()} <strong>To:</strong>{" "}
                {new Date(res.endTime).toLocaleString()}
              </p>
            </li>
          ))}
        </ul>
      )}

      <h2 className="text-2xl font-bold mb-4">Payment History</h2>
      {payments.length === 0 ? (
        <p>No payments found.</p>
      ) : (
        <ul>
          {payments.map((p) => (
            <div key={p._id} className="border-b py-2">
              <div>
                <strong>Amount:</strong> ${p.amount}
              </div>
              <div>
                <strong>Method:</strong> {p.paymentMethod}
              </div>
              <div>
                <strong>Status:</strong> {p.status}
              </div>
              <div>
                <strong>Date:</strong> {new Date(p.timestamp).toLocaleString()}
              </div>
            </div>
          ))}
        </ul>
      )}
    </div>
  );
}
