const mockRetrieve = jest.fn();
const mockCreate = jest.fn();
jest.mock("stripe", () => () => ({
  paymentIntents: { retrieve: mockRetrieve, create: mockCreate },
}));
jest.mock("../socket", () => ({
  init: jest.fn(),
  getIO: jest.fn(() => ({ emit: jest.fn() })),
}));
jest.mock("../config/db", () => jest.fn());
jest.mock("../config/passport", () => {});
jest.mock("../models/parking_db");
jest.mock("../models/payments");
jest.mock("../models/User");

const request = require("supertest");
const jwt = require("jsonwebtoken");
const app = require("../app");
const { Reservation, ParkingSpot } = require("../models/parking_db");
const { Payment } = require("../models/payments");
const User = require("../models/User");

process.env.JWT_SECRET = "test-secret";
const SPOT_ID = "a1b2c3d4e5f6a1b2c3d4e5f6"; // request ids must look like Mongo ObjectIds
const RES_ID = "b1b2c3d4e5f6a1b2c3d4e5f6";

const makeToken = (payload = { id: "user123", email: "u@test.com" }) =>
  jwt.sign(payload, "test-secret");
const auth = () => ({ Authorization: `Bearer ${makeToken()}` });

beforeEach(() => jest.clearAllMocks());

describe("JWT expiry", () => {
  const { signToken } = require("../utils/token");

  it("signToken issues tokens that expire", () => {
    const decoded = jwt.verify(signToken({ id: "u1" }), "test-secret");
    expect(decoded.exp).toBeGreaterThan(decoded.iat);
  });

  it("rejects an expired token", async () => {
    const expired = jwt.sign({ id: "u1" }, "test-secret", { expiresIn: -10 });
    const res = await request(app)
      .get("/api/user/wallet")
      .set("Authorization", `Bearer ${expired}`);
    expect(res.status).toBe(401);
  });
});

describe("POST /api/payment/create-intent", () => {
  const HOUR = 60 * 60 * 1000;
  const booking = (durationMs) => {
    const start = Date.now();
    return {
      startTime: new Date(start).toISOString(),
      endTime: new Date(start + durationMs).toISOString(),
    };
  };

  it("returns 401 without a token", async () => {
    const res = await request(app).post("/api/payment/create-intent").send(booking(HOUR));
    expect(res.status).toBe(401);
  });

  it.each([
    ["no times", {}],
    ["an invalid date", { startTime: "nope", endTime: "2030-01-01" }],
    ["endTime before startTime", booking(-HOUR)],
    ["a booking priced over the maximum", booking(300 * HOUR)],
  ])("rejects %s", async (_name, body) => {
    const res = await request(app).post("/api/payment/create-intent").set(auth()).send(body);
    expect(res.status).toBe(400);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("returns 409 without creating an intent when the user has an overlapping booking", async () => {
    Reservation.findOne = jest.fn().mockResolvedValue({ _id: "r1" });
    const res = await request(app).post("/api/payment/create-intent").set(auth()).send(booking(HOUR));
    expect(res.status).toBe(409);
    expect(mockCreate).not.toHaveBeenCalled();
    expect(Reservation.findOne).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "user123", status: { $in: ["reserved", "checked-in"] } })
    );
  });

  it("prices the intent from the duration and ignores a client amount", async () => {
    Reservation.findOne = jest.fn().mockResolvedValue(null);
    mockCreate.mockResolvedValue({ client_secret: "secret_123" });
    const res = await request(app)
      .post("/api/payment/create-intent")
      .set(auth())
      .send({ ...booking(90 * 60 * 1000), amount: 50 }); // 90 min bills as 2 hours
    expect(res.status).toBe(200);
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({ amount: 1000, metadata: { userId: "user123" } })
    );
  });
});

describe("POST /api/payment/checkout", () => {
  const body = { transactionId: "pi_123", amount: 99999 }; // client amount must be ignored

  it("returns 401 without a token", async () => {
    const res = await request(app).post("/api/payment/checkout").send(body);
    expect(res.status).toBe(401);
  });

  it("rejects a transactionId that is not a PaymentIntent id", async () => {
    const res = await request(app)
      .post("/api/payment/checkout")
      .set(auth())
      .send({ transactionId: "fake" });
    expect(res.status).toBe(400);
    expect(mockRetrieve).not.toHaveBeenCalled();
  });

  it("rejects an intent that has not succeeded", async () => {
    mockRetrieve.mockResolvedValue({ status: "requires_payment_method", metadata: { userId: "user123" } });
    const res = await request(app).post("/api/payment/checkout").set(auth()).send(body);
    expect(res.status).toBe(402);
  });

  it("rejects an intent that belongs to another user", async () => {
    mockRetrieve.mockResolvedValue({ status: "succeeded", metadata: { userId: "someone-else" }, amount_received: 500 });
    const res = await request(app).post("/api/payment/checkout").set(auth()).send(body);
    expect(res.status).toBe(403);
  });

  it("rejects a payment that was already recorded", async () => {
    mockRetrieve.mockResolvedValue({ status: "succeeded", metadata: { userId: "user123" }, amount_received: 500 });
    Payment.findOne = jest.fn().mockResolvedValue({ transactionId: "pi_123" });
    const res = await request(app).post("/api/payment/checkout").set(auth()).send(body);
    expect(res.status).toBe(409);
  });

  it("stores the amount Stripe reports, not the one the client sent", async () => {
    mockRetrieve.mockResolvedValue({ status: "succeeded", metadata: { userId: "user123" }, amount_received: 500 });
    Payment.findOne = jest.fn().mockResolvedValue(null);
    Payment.mockImplementation((doc) => ({ ...doc, save: jest.fn().mockResolvedValue(undefined) }));

    const res = await request(app).post("/api/payment/checkout").set(auth()).send(body);

    expect(res.status).toBe(201);
    expect(Payment).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "user123", amount: 5, transactionId: "pi_123", status: "completed" })
    );
  });
});

describe("DELETE /api/user/cancel/:id", () => {
  it("returns 401 without a token", async () => {
    const res = await request(app).delete(`/api/user/cancel/${RES_ID}`);
    expect(res.status).toBe(401);
  });

  it("returns 403 for someone else's reservation", async () => {
    Reservation.findById = jest.fn().mockResolvedValue({ _id: "r1", userId: "other", status: "reserved" });
    const res = await request(app).delete(`/api/user/cancel/${RES_ID}`).set(auth());
    expect(res.status).toBe(403);
  });

  it("refuses to cancel after check-in", async () => {
    Reservation.findById = jest.fn().mockResolvedValue({ _id: "r1", userId: "user123", status: "checked-in" });
    const res = await request(app).delete(`/api/user/cancel/${RES_ID}`).set(auth());
    expect(res.status).toBe(400);
  });

  it("keeps the cancelled reservation and frees the spot", async () => {
    const reservation = {
      _id: "r1", userId: "user123", spotId: "s1", status: "reserved",
      save: jest.fn().mockResolvedValue(undefined),
    };
    Reservation.findById = jest.fn().mockResolvedValue(reservation);
    Reservation.findByIdAndDelete = jest.fn();
    ParkingSpot.findByIdAndUpdate = jest.fn().mockResolvedValue({});
    const res = await request(app).delete(`/api/user/cancel/${RES_ID}`).set(auth());
    expect(res.status).toBe(200);
    expect(reservation.status).toBe("cancelled");
    expect(reservation.save).toHaveBeenCalled();
    expect(Reservation.findByIdAndDelete).not.toHaveBeenCalled();
    expect(ParkingSpot.findByIdAndUpdate).toHaveBeenCalledWith(
      "s1",
      { isAvailable: true, reservedBy: null, occupiedBy: null },
      { new: true }
    );
  });
});

describe("removed unauthenticated reserve route", () => {
  it("POST /api/user/reserve no longer exists", async () => {
    const res = await request(app)
      .post("/api/user/reserve")
      .send({ userId: "victim", spotId: "s1", startTime: new Date(), endTime: new Date() });
    expect(res.status).toBe(404);
  });
});

describe("POST /api/user/checkout-credit ownership", () => {
  it("returns 403 for someone else's reservation", async () => {
    Reservation.findById = jest.fn().mockResolvedValue({ _id: "r1", userId: "other", status: "checked-in" });
    const res = await request(app).post("/api/user/checkout-credit").set(auth()).send({ reservationId: RES_ID });
    expect(res.status).toBe(403);
  });

  it("credits unused time to the wallet and broadcasts the freed spot", async () => {
    const inThirtyMin = new Date(Date.now() + 30 * 60 * 1000);
    const reservation = {
      _id: "r1", userId: "user123", spotId: "s1", status: "checked-in",
      endTime: inThirtyMin, save: jest.fn().mockResolvedValue(undefined),
    };
    Reservation.findById = jest.fn().mockResolvedValue(reservation);
    Reservation.findOneAndUpdate = jest.fn().mockResolvedValue({ _id: "r1" });
    ParkingSpot.findByIdAndUpdate = jest.fn().mockResolvedValue({ _id: "s1", isAvailable: true });
    User.findByIdAndUpdate = jest.fn().mockResolvedValue(null);

    const res = await request(app).post("/api/user/checkout-credit").set(auth()).send({ reservationId: RES_ID });

    expect(res.status).toBe(200);
    expect(res.body.walletCredit).toBeGreaterThan(2.4); // ~30 min at $5/hr
    expect(res.body.walletCredit).toBeLessThanOrEqual(2.5);
    expect(User.findByIdAndUpdate).toHaveBeenCalledWith("user123", {
      $inc: { walletBalance: res.body.walletCredit },
    });
    expect(Reservation.findOneAndUpdate).toHaveBeenCalledWith(
      { _id: "r1", status: "checked-in" },
      { status: "completed" }
    );
  });

  it("does not credit twice when another request already completed the reservation", async () => {
    Reservation.findById = jest.fn().mockResolvedValue({
      _id: "r1", userId: "user123", spotId: "s1", status: "checked-in",
      endTime: new Date(Date.now() + 30 * 60 * 1000),
    });
    Reservation.findOneAndUpdate = jest.fn().mockResolvedValue(null); // lost the race
    User.findByIdAndUpdate = jest.fn();

    const res = await request(app).post("/api/user/checkout-credit").set(auth()).send({ reservationId: RES_ID });

    expect(res.status).toBe(400);
    expect(User.findByIdAndUpdate).not.toHaveBeenCalled();
  });
});

describe("admin endpoints", () => {
  const roleIs = (role) => {
    User.findById = jest.fn().mockReturnValue({ select: jest.fn().mockResolvedValue({ role }) });
  };

  it("returns 401 without a token", async () => {
    const res = await request(app).get("/api/admin/payments");
    expect(res.status).toBe(401);
  });

  it("returns 403 for a non-admin even if the token claims admin", async () => {
    roleIs("user");
    const token = makeToken({ id: "user123", role: "admin" });
    const res = await request(app).get("/api/admin/payments").set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(403);
  });
});

describe("/app/settings", () => {
  it("GET returns 401 without a token", async () => {
    const res = await request(app).get("/app/settings");
    expect(res.status).toBe(401);
  });

  it("GET never returns the password hash", async () => {
    const select = jest.fn().mockResolvedValue({ _id: "user123", name: "A" });
    User.findById = jest.fn().mockReturnValue({ select });
    const res = await request(app).get("/app/settings").set(auth());
    expect(res.status).toBe(200);
    expect(select).toHaveBeenCalledWith("-password");
  });

  it("PUT only passes name, email and phoneNumber to the database", async () => {
    const select = jest.fn().mockResolvedValue({ _id: "user123", name: "New" });
    User.findByIdAndUpdate = jest.fn().mockReturnValue({ select });
    const res = await request(app)
      .put("/app/settings")
      .set(auth())
      .send({ name: "New", role: "admin", walletBalance: 9999 });
    expect(res.status).toBe(200);
    expect(User.findByIdAndUpdate).toHaveBeenCalledWith("user123", { name: "New" }, { new: true });
  });
});
