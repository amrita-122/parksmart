const mongoose = require("mongoose");

// Payment Schema
const PaymentSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User", // Reference to the User schema
    required: true,
  },
  reservationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Reservation", // Reference to the Reservation schema
    required: false,
  },
  amount: {
    type: Number,
    required: true,
  },
  status: {
    type: String,
    enum: ["pending", "completed", "failed"],
    default: "pending",
  },
  paymentMethod: {
    type: String,
    enum: ["credit_card", "debit_card", "paypal", "bank_transfer", "wallet"],
    required: true,
  },
  transactionId: {
    type: String,
    unique: true,
    required: true,
  },
  timestamp: {
    type: Date,
    default: Date.now,
  },
});

module.exports = { Payment: mongoose.model("Payment", PaymentSchema) };
