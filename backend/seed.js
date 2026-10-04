/**
 * Seed script — creates an admin user directly in MongoDB.
 * Run once: node seed.js
 */
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const User = require("./models/User");
require('dotenv').config();
const SEED_USERS = [
  {
    name: "Admin",
    email: "admin@ufv.ca",
    phoneNumber: "6041234567",
    password: "123456",
    role: "admin",
    provider: "local",
  },
];

async function seed() {
  await mongoose.connect(process.env.MongoDB_URL);
  console.log("Connected to MongoDB");

  for (const u of SEED_USERS) {
    const existing = await User.findOne({ email: u.email });
    if (existing) {
      console.log(`⚠️  ${u.email} already exists — skipping`);
      continue;
    }
    const hashed = await bcrypt.hash(u.password, 10);
    await User.create({ ...u, password: hashed });
    console.log(`✅ Created ${u.role}: ${u.email} / ${u.password}`);
  }

  await mongoose.disconnect();
  console.log("Done.");
}

seed().catch((err) => { console.error(err); process.exit(1); });
