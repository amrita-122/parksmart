const mongoose = require("mongoose");
require('dotenv').config()

const connectDB = async () => {
try {
    await mongoose.connect(process.env.MongoDB_URL);
    console.log("Mongo DB Connected");
  }
 catch (error) {
  // Don't log the connection string: it contains the database password.
  console.error("Error occurred while connecting to database:", error.message);
  process.exit(1);
}
}

module.exports = connectDB
