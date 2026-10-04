// routes/payment.js builds the Stripe client when it is first required, and Stripe
// throws without a key. CI has no .env, so give the tests a dummy one (no real calls are made).
process.env.STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || "sk_test_placeholder";
