const mongoose = require("mongoose");

// Parking Spot Schema
const ParkingSpotSchema = new mongoose.Schema({
    lotNumber: {
        type: String,
        required: true
    },
    spotNumber: {
        type: String,
        required: true,
        unique: true
    },
    isAvailable: {
        type: Boolean,
        default: true
    },
    reservedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        default: null
    },
    occupiedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        default: null
    },
    lat: {
        type: Number,
        required: true
    },
    lng: {
        type: Number,
        required: true
    }

});

// Reservation Schema
const ReservationSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true
    },
    spotId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "ParkingSpot",
        required: true
    },
    startTime: {
        type: Date,
        required: true
    },
    endTime: {
        type: Date,
        required: true
    },
    status: {
        type: String,
        enum: ["reserved", "checked-in", "completed", "cancelled", "violated"],
        default: "reserved"
    }
});

// Check-In Schema
const CheckInSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true
    },
    reservationId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Reservation",
        required: true
    },
    checkInTime: {
        type: Date,
        default: Date.now
    }
});

// Check-Out Schema
const CheckOutSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true
    },
    reservationId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Reservation",
        required: true
    },
    checkOutTime: {
        type: Date,
        default: Date.now
    }
});

ParkingSpotSchema.index({ lat: 1, lng: 1 });
// spotNumber already indexed via unique:true above
ParkingSpotSchema.index({ isAvailable: 1 });

ReservationSchema.index({ userId: 1 });
ReservationSchema.index({ spotId: 1 });
ReservationSchema.index({ status: 1 });

module.exports = {
    ParkingSpot: mongoose.model("ParkingSpot", ParkingSpotSchema),
    Reservation: mongoose.model("Reservation", ReservationSchema),
    CheckIn: mongoose.model("CheckIn", CheckInSchema),
    CheckOut: mongoose.model("CheckOut", CheckOutSchema)
};
