const {SerialPort} = require("serialport");
const { ReadlineParser } = require("@serialport/parser-readline");
const axios = require("axios");
require("dotenv").config();

// The backend only accepts sensor updates that carry this key (DEVICE_API_KEY in backend/.env).
if (!process.env.DEVICE_API_KEY) {
  console.error("DEVICE_API_KEY is not set in backend/.env; the backend will reject every update.");
  process.exit(1);
}

const port = new SerialPort({
    path: "COM5",
    baudRate: 9600,
});
const parser = port.pipe(new ReadlineParser({ delimiter: "\n" }));


parser.on("data", async (line) => {
  const status = line.trim(); // "occupied" or "available"
  console.log("📡 From Arduino:", status);

  const isAvailable = status === "available";

  try {
    const response = await axios.post("http://localhost:3000/api/parking/update-status", {
      spotNumber: "11", // ✅ match this to your database
      isAvailable,
    }, {
      headers: { "x-device-key": process.env.DEVICE_API_KEY },
    });

    console.log("✅ Backend Updated:", response.data.updated);
  } catch (error) {
    console.error("❌ Failed to send:", error.message);
  }
});
