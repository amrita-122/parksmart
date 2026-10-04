require("dotenv").config();
const http = require("http");
const connectDb = require("./config/db");
const { init } = require("./socket");
const app = require("./app");

const httpServer = http.createServer(app);
init(httpServer);
connectDb();

httpServer.listen(process.env.PORT, () =>
  console.log("Server running on", process.env.PORT)
);
