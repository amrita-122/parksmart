const { Reservation } = require("../models/parking_db");

// An active booking (reserved or checked-in) for this user whose time range
// overlaps [start, end). Back-to-back bookings (end == other start) do not overlap.
const findOverlappingReservation = (userId, start, end) =>
  Reservation.findOne({
    userId,
    status: { $in: ["reserved", "checked-in"] },
    startTime: { $lt: end },
    endTime: { $gt: start },
  });

module.exports = { findOverlappingReservation };
