require("dotenv").config();
const http = require("http");
const connectDb = require("./config/db");
const { init } = require("./socket");
const app = require("./app");

// Fail at startup, not on the first login, if the signing secret is missing.
if (!process.env.JWT_SECRET) {
  console.error("JWT_SECRET is not set; refusing to start.");
  process.exit(1);
}
if (!process.env.DEVICE_API_KEY) {
  console.warn("DEVICE_API_KEY is not set; sensor updates (/api/parking/update-status) will be rejected.");
}

const httpServer = http.createServer(app);
init(httpServer);
connectDb();

httpServer.listen(process.env.PORT, () =>
  console.log("Server running on", process.env.PORT)
);
