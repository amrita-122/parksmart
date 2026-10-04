const { Reservation, ParkingSpot } = require("../models/parking_db");
const User = require("../models/User");
const { getIO } = require("../socket");
const { RATE_PER_HOUR } = require("./pricing");

// Completes a checked-in reservation, frees its spot and credits the unused part
// of the booking to the user's wallet. Used by the manual check-out and by the
// sensor when the car leaves.
//
// The checked-in -> completed change is one conditional write, so if a manual
// check-out and a sensor report race, only one of them credits the wallet.
// Returns null when the reservation was no longer checked in.
async function completeWithCredit(reservation, now = new Date()) {
  const claimed = await Reservation.findOneAndUpdate(
    { _id: reservation._id, status: "checked-in" },
    { status: "completed" }
  );
  if (!claimed) return null;

  const endTime = new Date(reservation.endTime);
  let walletCredit = 0;
  if (now < endTime) {
    const unusedMinutes = (endTime - now) / (1000 * 60);
    walletCredit = parseFloat(((unusedMinutes / 60) * RATE_PER_HOUR).toFixed(2));
  }

  const spot = await ParkingSpot.findByIdAndUpdate(
    reservation.spotId,
    { isAvailable: true, reservedBy: null, occupiedBy: null },
    { new: true }
  );

  if (walletCredit > 0) {
    await User.findByIdAndUpdate(reservation.userId, { $inc: { walletBalance: walletCredit } });
  }

  getIO().emit("spot:updated", spot);
  return { walletCredit, spot };
}

module.exports = { completeWithCredit };
