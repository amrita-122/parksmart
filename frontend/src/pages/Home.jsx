import Maps from "../components/Maps";
import { useEffect, useState } from "react";
import axios from "axios";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3000";

export const Home = () => {
  const [nearestSpot, setNearestSpot] = useState(null);
  const token = localStorage.getItem("token");

  useEffect(() => {
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const { latitude: lat, longitude: lng } = position.coords;
        try {
          const res = await axios.get(
            `${API_URL}/api/parking/nearest?lat=${lat}&lng=${lng}`,
            { headers: { Authorization: `Bearer ${token}` } }
          );
          setNearestSpot(res.data);
        } catch (err) {
          // 404 = no available spots — not a crash, just nothing to show
          if (err.response?.status !== 404) console.error("Failed to fetch nearest spot:", err);
        }
      },
      (err) => console.error("Location error", err),
      { enableHighAccuracy: true }
    );
  }, []);

  return (
    <div className="h-screen relative">
      {/* Pass nearestSpot so Maps can auto-highlight + draw route */}
      <Maps nearestSpot={nearestSpot} />

      {/* Nearest spot badge — only when there's an available spot */}
      {nearestSpot ? (
        <div className="absolute top-4 right-4 bg-white shadow-md px-3 py-2 rounded-xl z-40 text-sm text-gray-700 pointer-events-none">
          <span className="text-green-500 font-semibold">Nearest available:</span>{" "}
          Lot {nearestSpot.lotNumber}, Spot {nearestSpot.spotNumber}
        </div>
      ) : null}
    </div>
  );
};
