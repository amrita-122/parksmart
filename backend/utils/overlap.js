const { Reservation } = require("../models/parking_db");

// An active booking (reserved or checked-in) for this user whose time range
// overlaps [start, end). Back-to-back bookings (end == other start) do not overlap.
// `excludeId` skips one reservation, so a freshly saved booking can re-check itself.
const findOverlappingReservation = (userId, start, end, excludeId) =>
  Reservation.findOne({
    userId,
    ...(excludeId ? { _id: { $ne: excludeId } } : {}),
    status: { $in: ["reserved", "checked-in"] },
    startTime: { $lt: end },
    endTime: { $gt: start },
  });

module.exports = { findOverlappingReservation };
