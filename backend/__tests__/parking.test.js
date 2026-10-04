// Stable socket mock — share the same emit fn across all calls
const mockEmit = jest.fn();
jest.mock("../socket", () => ({
  init: jest.fn(),
  getIO: jest.fn(() => ({ emit: mockEmit })),
}));
jest.mock("../config/db", () => jest.fn());
jest.mock("../config/passport", () => {});
jest.mock("../models/parking_db");
jest.mock("../models/payments");
jest.mock("../models/User");

const request = require("supertest");
const app = require("../app");
const { ParkingSpot, Reservation } = require("../models/parking_db");
const { Payment } = require("../models/payments");
const User = require("../models/User");
const jwt = require("jsonwebtoken");

process.env.JWT_SECRET = "test-secret";
process.env.DEVICE_API_KEY = "test-device-key";

const makeToken = (payload = { id: "user123", email: "u@test.com" }) =>
  jwt.sign(payload, "test-secret");

// requireAdmin looks the role up in the database
const mockRole = (role) => {
  User.findById = jest.fn().mockReturnValue({
    select: jest.fn().mockResolvedValue(role ? { role } : null),
  });
};
const asAdmin = (req) => {
  mockRole("admin");
  return req.set("Authorization", `Bearer ${makeToken()}`);
};

describe("GET /api/parking/all", () => {
  it("returns all parking spots", async () => {
    ParkingSpot.find = jest.fn().mockResolvedValue([
      { _id: "s1", spotNumber: "1", lotNumber: "A", isAvailable: true, lat: 49.01, lng: -122.28 },
    ]);
    const res = await request(app).get("/api/parking/all");
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].spotNumber).toBe("1");
  });
});

describe("POST /api/parking/add", () => {
  it("returns 401 without a token", async () => {
    const res = await request(app)
      .post("/api/parking/add")
      .send({ lotNumber: "A", spotNumber: "1", lat: 49.01, lng: -122.28 });
    expect(res.status).toBe(401);
  });

  it("returns 403 for a non-admin user", async () => {
    mockRole("user");
    const res = await request(app)
      .post("/api/parking/add")
      .set("Authorization", `Bearer ${makeToken()}`)
      .send({ lotNumber: "A", spotNumber: "1", lat: 49.01, lng: -122.28 });
    expect(res.status).toBe(403);
  });

  it("returns 400 when fields are missing", async () => {
    const res = await asAdmin(request(app).post("/api/parking/add")).send({ lotNumber: "A" });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/required/i);
  });

  it("returns 400 if spot already exists", async () => {
    ParkingSpot.findOne = jest.fn().mockResolvedValue({ spotNumber: "1" });
    const res = await asAdmin(request(app).post("/api/parking/add"))
      .send({ lotNumber: "A", spotNumber: "1", lat: 49.01, lng: -122.28 });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/already exists/i);
  });

  it("creates a new spot successfully", async () => {
    ParkingSpot.findOne = jest.fn().mockResolvedValue(null);
    const saveMock = jest.fn().mockResolvedValue(undefined);
    ParkingSpot.mockImplementation(() => ({ save: saveMock, spotNumber: "2" }));
    const res = await asAdmin(request(app).post("/api/parking/add"))
      .send({ lotNumber: "A", spotNumber: "2", lat: 49.01, lng: -122.28 });
    expect(res.status).toBe(201);
  });
});

describe("DELETE /api/parking/delete/:id", () => {
  it("returns 401 without a token", async () => {
    const res = await request(app).delete("/api/parking/delete/s1");
    expect(res.status).toBe(401);
  });

  it("returns 403 for a non-admin user", async () => {
    mockRole("user");
    const res = await request(app)
      .delete("/api/parking/delete/s1")
      .set("Authorization", `Bearer ${makeToken()}`);
    expect(res.status).toBe(403);
  });

  it("deletes a spot as admin", async () => {
    ParkingSpot.findByIdAndDelete = jest.fn().mockResolvedValue({ _id: "s1" });
    const res = await asAdmin(request(app).delete("/api/parking/delete/s1"));
    expect(res.status).toBe(200);
  });
});

describe("POST /api/parking/update-status", () => {
  const send = (body, key = "test-device-key") => {
    const req = request(app).post("/api/parking/update-status");
    return (key ? req.set("x-device-key", key) : req).send(body);
  };

  it("returns 401 without a device key", async () => {
    const res = await send({ spotNumber: "11", isAvailable: false }, null);
    expect(res.status).toBe(401);
  });

  it("returns 401 with a wrong device key", async () => {
    const res = await send({ spotNumber: "11", isAvailable: false }, "wrong-key");
    expect(res.status).toBe(401);
  });

  it("rejects everything when no device key is configured", async () => {
    const saved = process.env.DEVICE_API_KEY;
    delete process.env.DEVICE_API_KEY;
    const res = await send({ spotNumber: "11", isAvailable: false });
    process.env.DEVICE_API_KEY = saved;
    expect(res.status).toBe(503);
  });

  it("returns 400 on missing data", async () => {
    const res = await send({});
    expect(res.status).toBe(400);
  });

  it("updates spot status and emits socket event", async () => {
    const updatedSpot = { _id: "s1", spotNumber: "11", isAvailable: false };
    ParkingSpot.findOneAndUpdate = jest.fn().mockResolvedValue(updatedSpot);
    mockEmit.mockClear();

    const res = await send({ spotNumber: "11", isAvailable: false });

    expect(res.status).toBe(200);
    expect(res.body.updated.spotNumber).toBe("11");
    expect(mockEmit).toHaveBeenCalledWith("spot:updated", updatedSpot);
  });

  it("returns 404 when spot not found", async () => {
    ParkingSpot.findOneAndUpdate = jest.fn().mockResolvedValue(null);
    ParkingSpot.exists = jest.fn().mockResolvedValue(null);
    const res = await send({ spotNumber: "999", isAvailable: true });
    expect(res.status).toBe(404);
  });

  it("ignores an 'available' report for a reserved spot", async () => {
    ParkingSpot.findOneAndUpdate = jest.fn().mockResolvedValue(null);
    ParkingSpot.exists = jest.fn().mockResolvedValue({ _id: "s1" });
    mockEmit.mockClear();

    const res = await send({ spotNumber: "11", isAvailable: true });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ success: true, ignored: true });
    expect(ParkingSpot.findOneAndUpdate.mock.calls[0][0]).toEqual({ spotNumber: "11", reservedBy: null });
    expect(mockEmit).not.toHaveBeenCalled();
  });

  it("frees an unreserved spot on an 'available' report", async () => {
    const updatedSpot = { _id: "s1", spotNumber: "11", isAvailable: true };
    ParkingSpot.findOneAndUpdate = jest.fn().mockResolvedValue(updatedSpot);
    mockEmit.mockClear();

    const res = await send({ spotNumber: "11", isAvailable: true });

    expect(res.status).toBe(200);
    expect(res.body.ignored).toBeUndefined();
    expect(mockEmit).toHaveBeenCalledWith("spot:updated", updatedSpot);
  });

  it("always applies an 'occupied' report, even for a reserved spot", async () => {
    ParkingSpot.findOneAndUpdate = jest.fn().mockResolvedValue({ _id: "s1", isAvailable: false });
    await send({ spotNumber: "11", isAvailable: false });
    expect(ParkingSpot.findOneAndUpdate.mock.calls[0][0]).toEqual({ spotNumber: "11" });
  });
});

describe("POST /api/parking/checkin and /checkout ownership", () => {
  const reservation = (userId, status) => ({
    _id: "r1",
    userId,
    spotId: "s1",
    status,
    save: jest.fn().mockResolvedValue(undefined),
  });

  it("checkin returns 401 without a token", async () => {
    const res = await request(app).post("/api/parking/checkin").send({ reservationId: "r1" });
    expect(res.status).toBe(401);
  });

  it("checkin returns 403 for someone else's reservation", async () => {
    Reservation.findById = jest.fn().mockResolvedValue(reservation("other-user", "reserved"));
    const res = await request(app)
      .post("/api/parking/checkin")
      .set("Authorization", `Bearer ${makeToken()}`)
      .send({ reservationId: "r1" });
    expect(res.status).toBe(403);
  });

  it("checkin succeeds for the owner", async () => {
    Reservation.findById = jest.fn().mockResolvedValue(reservation("user123", "reserved"));
    const res = await request(app)
      .post("/api/parking/checkin")
      .set("Authorization", `Bearer ${makeToken()}`)
      .send({ reservationId: "r1" });
    expect(res.status).toBe(200);
  });

  it("checkout returns 403 for someone else's reservation", async () => {
    Reservation.findById = jest.fn().mockResolvedValue(reservation("other-user", "checked-in"));
    const res = await request(app)
      .post("/api/parking/checkout")
      .set("Authorization", `Bearer ${makeToken()}`)
      .send({ reservationId: "r1" });
    expect(res.status).toBe(403);
  });
});

describe("POST /api/parking/reserve", () => {
  const MIN = 60 * 1000;
  // Times are offsets in minutes from now; the booking lasts one hour by default.
  const times = (startOffsetMin = 0, durationMin = 60) => {
    const start = Date.now() + startOffsetMin * MIN;
    return {
      startTime: new Date(start).toISOString(),
      endTime: new Date(start + durationMin * MIN).toISOString(),
    };
  };

  it("returns 401 without auth token", async () => {
    const res = await request(app).post("/api/parking/reserve").send({});
    expect(res.status).toBe(401);
  });

  describe("time validation", () => {
    const reserve = (body) =>
      request(app)
        .post("/api/parking/reserve")
        .set("Authorization", `Bearer ${makeToken()}`)
        .send({ spotId: "s1", ...body });

    beforeEach(() => {
      ParkingSpot.findOneAndUpdate = jest.fn().mockResolvedValue(null);
    });

    it.each([
      ["missing times", {}, /valid dates/i],
      ["an invalid date", { startTime: "not-a-date", endTime: "2030-01-01" }, /valid dates/i],
      ["endTime before startTime", times(0, -30), /after startTime/i],
      ["endTime equal to startTime", times(0, 0), /after startTime/i],
      ["a start more than 10 minutes in the past", times(-11), /in the past/i],
      ["a start more than 20 minutes ahead", times(25), /within 20 minutes/i],
    ])("returns 400 for %s without touching the spot", async (_name, body, message) => {
      const res = await reserve(body);
      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(message);
      expect(ParkingSpot.findOneAndUpdate).not.toHaveBeenCalled();
    });

    it("accepts a start a couple of minutes in the past", async () => {
      const res = await reserve(times(-2));
      // Validation passed, so it reaches the (mocked, unavailable) spot claim.
      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/not available/i);
      expect(ParkingSpot.findOneAndUpdate).toHaveBeenCalledTimes(1);
    });
  });

  it("returns 400 if the spot cannot be claimed", async () => {
    ParkingSpot.findOneAndUpdate = jest.fn().mockResolvedValue(null);
    Payment.findOneAndUpdate = jest.fn();
    const { startTime, endTime } = times();
    const res = await request(app)
      .post("/api/parking/reserve")
      .set("Authorization", `Bearer ${makeToken()}`)
      .send({ spotId: "s1", startTime, endTime });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/not available/i);
    // The loser of a race must not touch any payment.
    expect(Payment.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it("returns 403 and releases the spot if user has no completed payment", async () => {
    ParkingSpot.findOneAndUpdate = jest
      .fn()
      .mockResolvedValueOnce({ _id: "s1", isAvailable: false })
      .mockResolvedValue(null);
    Payment.findOneAndUpdate = jest.fn().mockResolvedValue(null);
    const { startTime, endTime } = times();
    const res = await request(app)
      .post("/api/parking/reserve")
      .set("Authorization", `Bearer ${makeToken()}`)
      .send({ spotId: "s1", startTime, endTime });
    expect(res.status).toBe(403);
    expect(res.body.message).toMatch(/payment/i);
    expect(ParkingSpot.findOneAndUpdate).toHaveBeenLastCalledWith(
      { _id: "s1", reservedBy: "user123" },
      { isAvailable: true, reservedBy: null }
    );
  });

  it("releases the payment and the spot if saving the reservation fails", async () => {
    ParkingSpot.findOneAndUpdate = jest
      .fn()
      .mockResolvedValueOnce({ _id: "s1", isAvailable: false })
      .mockResolvedValue(null);
    Payment.findOneAndUpdate = jest.fn().mockResolvedValue({ _id: "p1" });
    Payment.findByIdAndUpdate = jest.fn().mockResolvedValue(null);
    Reservation.mockImplementation(() => ({
      _id: "r1",
      save: jest.fn().mockRejectedValue(new Error("db down")),
    }));
    const { startTime, endTime } = times();
    const res = await request(app)
      .post("/api/parking/reserve")
      .set("Authorization", `Bearer ${makeToken()}`)
      .send({ spotId: "s1", startTime, endTime });
    expect(res.status).toBe(500);
    expect(Payment.findByIdAndUpdate).toHaveBeenCalledWith("p1", { reservationId: null });
    expect(ParkingSpot.findOneAndUpdate).toHaveBeenLastCalledWith(
      { _id: "s1", reservedBy: "user123" },
      { isAvailable: true, reservedBy: null }
    );
  });

  it("claims one unused payment per reservation", async () => {
    ParkingSpot.findOneAndUpdate = jest.fn().mockResolvedValue({ _id: "s1", isAvailable: false });
    Payment.findOneAndUpdate = jest.fn().mockResolvedValue({ _id: "p1" });
    Reservation.mockImplementation(() => ({
      _id: "r1",
      save: jest.fn().mockResolvedValue(undefined),
    }));
    const { startTime, endTime } = times();

    const res = await request(app)
      .post("/api/parking/reserve")
      .set("Authorization", `Bearer ${makeToken()}`)
      .send({ spotId: "s1", startTime, endTime });

    expect(res.status).toBe(201);
    expect(ParkingSpot.findOneAndUpdate).toHaveBeenCalledWith(
      { _id: "s1", isAvailable: true },
      { isAvailable: false, reservedBy: "user123" },
      { new: true }
    );
    const [filter, update] = Payment.findOneAndUpdate.mock.calls[0];
    // The one-hour booking from times() must be paid for with exactly $5.
    expect(filter).toMatchObject({ userId: "user123", amount: 5, status: "completed", reservationId: null });
    expect(update).toEqual({ reservationId: "r1" });
  });

  describe("paying with the wallet", () => {
    const reserveWithWallet = () => {
      const { startTime, endTime } = times(); // one hour = $5
      return request(app)
        .post("/api/parking/reserve")
        .set("Authorization", `Bearer ${makeToken()}`)
        .send({ spotId: "s1", startTime, endTime, useWallet: true });
    };

    beforeEach(() => {
      Payment.findOneAndUpdate = jest.fn();
      Payment.mockImplementation(() => ({ save: jest.fn().mockResolvedValue(undefined) }));
      Reservation.mockImplementation(() => ({
        _id: "r1",
        save: jest.fn().mockResolvedValue(undefined),
      }));
    });

    it("debits the price atomically and never touches stored payments", async () => {
      ParkingSpot.findOneAndUpdate = jest.fn().mockResolvedValue({ _id: "s1", isAvailable: false });
      User.findOneAndUpdate = jest.fn().mockResolvedValue({ _id: "user123" });

      const res = await reserveWithWallet();

      expect(res.status).toBe(201);
      expect(User.findOneAndUpdate).toHaveBeenCalledWith(
        { _id: "user123", walletBalance: { $gte: 5 } },
        { $inc: { walletBalance: -5 } }
      );
      expect(Payment.findOneAndUpdate).not.toHaveBeenCalled();
    });

    it("returns 402 and releases the spot when the balance is too low", async () => {
      ParkingSpot.findOneAndUpdate = jest
        .fn()
        .mockResolvedValueOnce({ _id: "s1", isAvailable: false })
        .mockResolvedValue(null);
      User.findOneAndUpdate = jest.fn().mockResolvedValue(null);

      const res = await reserveWithWallet();

      expect(res.status).toBe(402);
      expect(res.body.message).toMatch(/insufficient/i);
      expect(ParkingSpot.findOneAndUpdate).toHaveBeenLastCalledWith(
        { _id: "s1", reservedBy: "user123" },
        { isAvailable: true, reservedBy: null }
      );
    });

    it("refunds the wallet and releases the spot if saving fails", async () => {
      ParkingSpot.findOneAndUpdate = jest
        .fn()
        .mockResolvedValueOnce({ _id: "s1", isAvailable: false })
        .mockResolvedValue(null);
      User.findOneAndUpdate = jest.fn().mockResolvedValue({ _id: "user123" });
      User.findByIdAndUpdate = jest.fn().mockResolvedValue(null);
      Reservation.mockImplementation(() => ({
        _id: "r1",
        save: jest.fn().mockRejectedValue(new Error("db down")),
      }));

      const res = await reserveWithWallet();

      expect(res.status).toBe(500);
      expect(User.findByIdAndUpdate).toHaveBeenCalledWith("user123", { $inc: { walletBalance: 5 } });
    });
  });
});
