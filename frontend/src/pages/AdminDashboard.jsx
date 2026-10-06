import { useEffect, useState, useMemo } from "react";
import axios from "axios";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend, LineChart, Line, CartesianGrid,
} from "recharts";

import { API_URL } from "../config";
const COLORS = ["#22c55e", "#ef4444", "#3b82f6", "#f59e0b", "#8b5cf6"];

export default function AdminDashboard() {
  const [spots, setSpots] = useState([]);
  const [reservations, setReservations] = useState([]);
  const [payments, setPayments] = useState([]);
  const [lotNumber, setLotNumber] = useState("");
  const [spotNumber, setSpotNumber] = useState("");
  const [lat, setLat] = useState("");
  const [lng, setLng] = useState("");

  const token = localStorage.getItem("token");
  const headers = { headers: { Authorization: `Bearer ${token}` } };

  useEffect(() => { fetchAll(); }, []); // eslint-disable-line react-hooks/exhaustive-deps -- load once on mount

  const fetchAll = async () => {
    try {
      const [spotsRes, reservationsRes, paymentsRes] = await Promise.all([
        axios.get(`${API_URL}/api/parking/all`, headers),
        axios.get(`${API_URL}/api/admin/reservations`, headers),
        axios.get(`${API_URL}/api/admin/payments`, headers),
      ]);
      setSpots(spotsRes.data);
      setReservations(reservationsRes.data);
      setPayments(paymentsRes.data);
    } catch (err) {
      console.error("Admin Dashboard Load Error:", err);
    }
  };

  const handleAddSpot = async () => {
    try {
      await axios.post(
        `${API_URL}/api/parking/add`,
        { lotNumber, spotNumber, lat: parseFloat(lat), lng: parseFloat(lng) },
        headers
      );
      alert("New spot added!");
      setLotNumber(""); setSpotNumber(""); setLat(""); setLng("");
      fetchAll();
    } catch (err) {
      alert("Error adding spot: " + err.response?.data?.message);
    }
  };

  const handleDeleteSpot = async (id) => {
    if (!window.confirm("Delete this parking spot?")) return;
    try {
      await axios.delete(`${API_URL}/api/parking/delete/${id}`, headers);
      fetchAll();
    } catch (err) {
      alert("Failed to delete spot.", err);
    }
  };

  // --- Analytics computations ---

  // Occupancy: available vs occupied
  const occupancyData = useMemo(() => [
    { name: "Available", value: spots.filter((s) => s.isAvailable).length },
    { name: "Occupied", value: spots.filter((s) => !s.isAvailable).length },
  ], [spots]);

  // Revenue by day (last 7 days)
  const revenueByDay = useMemo(() => {
    const days = {};
    const now = new Date();
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const key = d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
      days[key] = 0;
    }
    payments.forEach((p) => {
      if (p.status !== "completed") return;
      const key = new Date(p.timestamp).toLocaleDateString("en-US", { month: "short", day: "numeric" });
      if (key in days) days[key] += p.amount;
    });
    return Object.entries(days).map(([date, revenue]) => ({ date, revenue }));
  }, [payments]);

  // Reservations by status
  const reservationsByStatus = useMemo(() => {
    const counts = {};
    reservations.forEach((r) => {
      counts[r.status] = (counts[r.status] || 0) + 1;
    });
    return Object.entries(counts).map(([status, count]) => ({ status, count }));
  }, [reservations]);

  // Summary stats
  const totalRevenue = useMemo(
    () => payments.filter((p) => p.status === "completed").reduce((sum, p) => sum + p.amount, 0),
    [payments]
  );

  return (
    <div className="p-6">
      <h1 className="text-3xl font-bold mb-6">Admin Dashboard</h1>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        {[
          { label: "Total Spots", value: spots.length, color: "bg-blue-50 border-blue-200" },
          { label: "Available", value: spots.filter((s) => s.isAvailable).length, color: "bg-green-50 border-green-200" },
          { label: "Reservations", value: reservations.length, color: "bg-purple-50 border-purple-200" },
          { label: "Total Revenue", value: `$${totalRevenue.toFixed(2)}`, color: "bg-yellow-50 border-yellow-200" },
        ].map(({ label, value, color }) => (
          <div key={label} className={`p-4 rounded-lg border ${color}`}>
            <p className="text-sm text-gray-500">{label}</p>
            <p className="text-2xl font-bold text-gray-800">{value}</p>
          </div>
        ))}
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">

        {/* Revenue line chart */}
        <div className="md:col-span-2 bg-white border rounded-lg p-4">
          <h2 className="text-lg font-semibold mb-3">Revenue (Last 7 Days)</h2>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={revenueByDay}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="date" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `$${v}`} />
              <Tooltip formatter={(v) => [`$${v.toFixed(2)}`, "Revenue"]} />
              <Line type="monotone" dataKey="revenue" stroke="#3b82f6" strokeWidth={2} dot={{ r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Occupancy pie chart */}
        <div className="bg-white border rounded-lg p-4">
          <h2 className="text-lg font-semibold mb-3">Spot Occupancy</h2>
          <ResponsiveContainer width="100%" height={200}>
            <PieChart>
              <Pie data={occupancyData} cx="50%" cy="50%" outerRadius={70} dataKey="value" label={({ name, value }) => `${name}: ${value}`} labelLine={false}>
                {occupancyData.map((_, i) => (
                  <Cell key={i} fill={COLORS[i % COLORS.length]} />
                ))}
              </Pie>
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </div>

        {/* Reservations by status bar chart */}
        <div className="md:col-span-3 bg-white border rounded-lg p-4">
          <h2 className="text-lg font-semibold mb-3">Reservations by Status</h2>
          <ResponsiveContainer width="100%" height={160}>
            <BarChart data={reservationsByStatus} layout="vertical">
              <XAxis type="number" tick={{ fontSize: 11 }} />
              <YAxis type="category" dataKey="status" tick={{ fontSize: 11 }} width={80} />
              <Tooltip />
              <Bar dataKey="count" fill="#8b5cf6" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Add New Spot */}
      <div className="mb-8 p-4 border rounded bg-gray-50">
        <h2 className="text-xl font-semibold mb-2">Add New Parking Spot</h2>
        <div className="flex flex-wrap gap-2">
          {[
            { value: lotNumber, setter: setLotNumber, placeholder: "Lot Number" },
            { value: spotNumber, setter: setSpotNumber, placeholder: "Spot Number" },
            { value: lat, setter: setLat, placeholder: "Latitude" },
            { value: lng, setter: setLng, placeholder: "Longitude" },
          ].map(({ value, setter, placeholder }) => (
            <input
              key={placeholder}
              className="border p-2 rounded"
              value={value}
              onChange={(e) => setter(e.target.value)}
              placeholder={placeholder}
            />
          ))}
          <button
            onClick={handleAddSpot}
            className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-800"
          >
            Add Spot
          </button>
        </div>
      </div>

      {/* Spot Table */}
      <div className="mb-8">
        <h2 className="text-xl font-semibold mb-2">All Parking Spots</h2>
        <table className="w-full border text-sm">
          <thead className="bg-gray-200">
            <tr>
              <th className="p-2">Lot</th>
              <th className="p-2">Spot</th>
              <th className="p-2">Status</th>
              <th className="p-2">Reserved By</th>
              <th className="p-2">Lat</th>
              <th className="p-2">Lng</th>
              <th className="p-2">Action</th>
            </tr>
          </thead>
          <tbody>
            {spots.map((spot) => (
              <tr key={spot._id} className="border-t">
                <td className="p-2">{spot.lotNumber}</td>
                <td className="p-2">{spot.spotNumber}</td>
                <td className="p-2">{spot.isAvailable ? "✅ Available" : "❌ Occupied"}</td>
                <td className="p-2">{spot.reservedBy ?? "-"}</td>
                <td className="p-2">{spot.lat.toFixed(5)}</td>
                <td className="p-2">{spot.lng.toFixed(5)}</td>
                <td className="p-2">
                  <button onClick={() => handleDeleteSpot(spot._id)} className="text-red-500 hover:underline">
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Reservations Table */}
      <div className="mb-8">
        <h2 className="text-xl font-semibold mb-2">Active Reservations</h2>
        <table className="w-full border text-sm">
          <thead className="bg-gray-200">
            <tr>
              <th className="p-2">User</th>
              <th className="p-2">Spot</th>
              <th className="p-2">Status</th>
              <th className="p-2">Start</th>
              <th className="p-2">End</th>
            </tr>
          </thead>
          <tbody>
            {reservations.map((res) => (
              <tr key={res._id} className="border-t">
                <td className="p-2">{res.userId?.email}</td>
                <td className="p-2">{res.spotId?.spotNumber}</td>
                <td className="p-2">{res.status}</td>
                <td className="p-2">{new Date(res.startTime).toLocaleString()}</td>
                <td className="p-2">{new Date(res.endTime).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Payments Table */}
      <div>
        <h2 className="text-xl font-semibold mb-2">Payments</h2>
        <table className="w-full border text-sm">
          <thead className="bg-gray-200">
            <tr>
              <th className="p-2">User</th>
              <th className="p-2">Amount</th>
              <th className="p-2">Method</th>
              <th className="p-2">Status</th>
              <th className="p-2">Time</th>
            </tr>
          </thead>
          <tbody>
            {payments.map((p) => (
              <tr key={p._id} className="border-t">
                <td className="p-2">{p.userId?.email}</td>
                <td className="p-2">${p.amount}</td>
                <td className="p-2">{p.paymentMethod}</td>
                <td className="p-2">{p.status}</td>
                <td className="p-2">{new Date(p.timestamp).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
