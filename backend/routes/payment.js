// /routes/payment.js
const express = require("express");
const router = express.Router();
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
const authenticate = require("../middlewares/authenticate");
const { Payment } = require("../models/payments");
const { priceForDuration } = require("../utils/pricing");

const MIN_CENTS = 50; // Stripe's minimum charge in USD
const MAX_CENTS = 100000; // $1,000 per payment

// Create Stripe PaymentIntent
router.post("/create-intent", authenticate, async (req, res) => {
  // The price comes from the booked duration; any amount in the body is ignored.
  const { startTime, endTime } = req.body;
  const start = new Date(startTime);
  const end = new Date(endTime);
  if (!startTime || !endTime || isNaN(start) || isNaN(end) || end <= start) {
    return res.status(400).json({ message: "Valid startTime and endTime are required" });
  }

  const amount = priceForDuration(start, end) * 100; // cents
  if (amount < MIN_CENTS || amount > MAX_CENTS) {
    return res.status(400).json({ message: "Invalid amount" });
  }

  try {
    const paymentIntent = await stripe.paymentIntents.create({
      amount, // in cents
      currency: "usd",
      payment_method_types: ["card"],
      // Lets /checkout prove this intent was created for the same user.
      metadata: { userId: String(req.user.id) },
    });

    res.json(paymentIntent.client_secret);
  } catch (error) {
    console.error("Create intent failed:", error.message);
    res.status(500).json({ message: "Could not start payment" });
  }
});

// Record a payment. Stripe is the source of truth: the amount and status come
// from the PaymentIntent, never from the request body.
router.post("/checkout", authenticate, async (req, res) => {
  try {
    const { reservationId, transactionId } = req.body;

    if (typeof transactionId !== "string" || !transactionId.startsWith("pi_")) {
      return res.status(400).json({ message: "Invalid transactionId" });
    }

    const intent = await stripe.paymentIntents.retrieve(transactionId);

    if (intent.status !== "succeeded") {
      return res.status(402).json({ message: "Payment has not succeeded" });
    }
    if (intent.metadata?.userId !== String(req.user.id)) {
      return res.status(403).json({ message: "Payment belongs to another user" });
    }
    if (await Payment.findOne({ transactionId })) {
      return res.status(409).json({ message: "Payment already recorded" });
    }

    const payment = new Payment({
      userId: req.user.id,
      reservationId,
      amount: intent.amount_received / 100,
      paymentMethod: "credit_card", // the intent only allows cards
      transactionId,
      status: "completed",
    });

    await payment.save();
    res.status(201).json({ message: "Payment successful", payment });
  } catch (error) {
    console.error("Payment save failed:", error.message);
    res.status(500).json({ message: "Payment failed" });
  }
});

module.exports = router;
