const {SerialPort} = require("serialport");
const { ReadlineParser } = require("@serialport/parser-readline");
const axios = require("axios");
require("dotenv").config();

// The backend only accepts sensor updates that carry this key (DEVICE_API_KEY in backend/.env).
if (!process.env.DEVICE_API_KEY) {
  console.error("DEVICE_API_KEY is not set in backend/.env; the backend will reject every update.");
  process.exit(1);
}

// Everything below can be overridden in backend/.env; the defaults match the original setup.
const SERIAL_PORT = process.env.SERIAL_PORT || "COM5";
const BAUD_RATE = Number(process.env.BAUD_RATE) || 9600;
const SPOT_NUMBER = process.env.SPOT_NUMBER || "11"; // must exist in the database
const API_URL = process.env.BRIDGE_API_URL || "http://localhost:3000";

const port = new SerialPort({
    path: SERIAL_PORT,
    baudRate: BAUD_RATE,
});
const parser = port.pipe(new ReadlineParser({ delimiter: "\n" }));


parser.on("data", async (line) => {
  const status = line.trim(); // "occupied" or "available"
  console.log("📡 From Arduino:", status);

  // Blank or garbled lines must not be read as "occupied".
  if (status !== "occupied" && status !== "available") return;

  const isAvailable = status === "available";

  try {
    const response = await axios.post(`${API_URL}/api/parking/update-status`, {
      spotNumber: SPOT_NUMBER,
      isAvailable,
    }, {
      headers: { "x-device-key": process.env.DEVICE_API_KEY },
    });

    console.log("✅ Backend Updated:", response.data.updated);
  } catch (error) {
    console.error("❌ Failed to send:", error.message);
  }
});
