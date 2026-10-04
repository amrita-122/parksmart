const mockRetrieve = jest.fn();
jest.mock("stripe", () => () => ({ paymentIntents: { retrieve: mockRetrieve, create: jest.fn() } }));
jest.mock("../socket", () => ({ init: jest.fn(), getIO: jest.fn(() => ({ emit: jest.fn() })) }));
jest.mock("../config/db", () => jest.fn());
jest.mock("../config/passport", () => {});
jest.mock("../utils/mailSender");
jest.mock("../models/User");
jest.mock("../models/OtpModel");
jest.mock("../models/parking_db");
jest.mock("../models/payments");

const request = require("supertest");
const jwt = require("jsonwebtoken");
const app = require("../app");
const User = require("../models/User");
const OTP = require("../models/OtpModel");
const { ParkingSpot } = require("../models/parking_db");
const { Payment } = require("../models/payments");
const mailSender = require("../utils/mailSender");

process.env.JWT_SECRET = "test-secret";
const auth = () => ({ Authorization: `Bearer ${jwt.sign({ id: "user123" }, "test-secret")}` });

beforeEach(() => jest.clearAllMocks());

describe("operator injection", () => {
  it("login rejects an object in place of the email", async () => {
    User.findOne = jest.fn();
    const res = await request(app)
      .post("/api/auth/login")
      .send({ emailorPhone: { $ne: null }, password: "x" });
    expect(res.status).toBe(400);
    expect(User.findOne).not.toHaveBeenCalled();
  });

  it("signup rejects an object in place of the email before any lookup", async () => {
    User.findOne = jest.fn();
    OTP.find = jest.fn();
    const res = await request(app).post("/api/auth/signup").send({
      name: "T", email: { $ne: null }, phoneNumber: "1234567890", password: "pass", otp: "123456",
    });
    expect(res.status).toBe(400);
    expect(User.findOne).not.toHaveBeenCalled();
    expect(OTP.find).not.toHaveBeenCalled();
  });

  it("reserve rejects a spotId that is an operator object", async () => {
    ParkingSpot.findOneAndUpdate = jest.fn();
    const res = await request(app)
      .post("/api/parking/reserve")
      .set(auth())
      .send({ spotId: { $ne: null }, startTime: new Date().toISOString(), endTime: new Date(Date.now() + 3600000).toISOString() });
    expect(res.status).toBe(400);
    expect(ParkingSpot.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it.each([
    ["checkin", "post", "/api/parking/checkin"],
    ["checkout", "post", "/api/parking/checkout"],
    ["checkout-credit", "post", "/api/user/checkout-credit"],
  ])("%s rejects a malformed reservationId", async (_name, method, url) => {
    const res = await request(app)[method](url).set(auth()).send({ reservationId: { $gt: "" } });
    expect(res.status).toBe(400);
  });

  it("cancel rejects a malformed id", async () => {
    const res = await request(app).delete("/api/user/cancel/not-an-id").set(auth());
    expect(res.status).toBe(400);
  });

  it("strips $-prefixed keys from query strings", async () => {
    ParkingSpot.find = jest.fn().mockResolvedValue([]);
    const res = await request(app).get("/api/parking/nearby?lat=49&lng=-122&radius[$gt]=0");
    // radius falls back to its default instead of becoming an operator object
    expect(res.status).toBe(200);
  });
});

describe("POST /api/auth/signup input checks", () => {
  const valid = { name: "T", email: "t@test.com", phoneNumber: "1234567890", password: "pass", otp: "123456" };

  it.each([
    ["a short phone number", { phoneNumber: "123" }],
    ["a malformed email", { email: "nope" }],
    ["a missing password", { password: undefined }],
    ["an over-long password", { password: "x".repeat(100) }],
  ])("returns 400 for %s", async (_name, override) => {
    const res = await request(app).post("/api/auth/signup").send({ ...valid, ...override });
    expect(res.status).toBe(400);
  });

  it("deletes the OTP after a successful signup", async () => {
    User.findOne = jest.fn().mockResolvedValue(null);
    OTP.find = jest.fn().mockReturnValue({
      sort: () => ({ limit: () => Promise.resolve([{ otp: "123456" }]) }),
    });
    OTP.deleteMany = jest.fn().mockResolvedValue({});
    User.mockImplementation((data) => ({ _id: "u1", role: "user", ...data, save: jest.fn().mockResolvedValue(undefined) }));

    const res = await request(app).post("/api/auth/signup").send(valid);

    expect(res.status).toBe(201);
    expect(OTP.deleteMany).toHaveBeenCalledWith({ email: "t@test.com" });
  });
});

describe("POST /api/auth/sendotp", () => {
  const body = { name: "T", email: "t@test.com", phoneNumber: "1234567890", password: "pass" };

  beforeEach(() => {
    User.findOne = jest.fn().mockResolvedValue(null);
    OTP.findOne = jest.fn().mockResolvedValue(null);
    OTP.create = jest.fn().mockResolvedValue({});
    OTP.deleteMany = jest.fn().mockResolvedValue({});
  });

  it("never returns the OTP in the response", async () => {
    mailSender.mockResolvedValue({ response: "250 ok" });
    const res = await request(app).post("/api/auth/sendotp").send(body);
    expect(res.status).toBe(200);
    expect(res.body).not.toHaveProperty("otp");
    expect(JSON.stringify(res.body)).not.toMatch(/\d{6}/);
  });

  it("returns 502 and discards the OTP if the email could not be sent", async () => {
    mailSender.mockResolvedValue(undefined);
    const res = await request(app).post("/api/auth/sendotp").send(body);
    expect(res.status).toBe(502);
    expect(OTP.deleteMany).toHaveBeenCalledWith({ email: "t@test.com" });
  });

  it("returns 400 for a malformed email", async () => {
    const res = await request(app).post("/api/auth/sendotp").send({ ...body, email: { $ne: null } });
    expect(res.status).toBe(400);
  });
});

describe("POST /api/payment/checkout", () => {
  it("ignores a client-supplied reservationId", async () => {
    mockRetrieve.mockResolvedValue({ status: "succeeded", metadata: { userId: "user123" }, amount_received: 500 });
    Payment.findOne = jest.fn().mockResolvedValue(null);
    Payment.mockImplementation(() => ({ save: jest.fn().mockResolvedValue(undefined) }));

    await request(app)
      .post("/api/payment/checkout")
      .set(auth())
      .send({ transactionId: "pi_123", reservationId: "b1b2c3d4e5f6a1b2c3d4e5f6" });

    expect(Payment.mock.calls[0][0]).not.toHaveProperty("reservationId");
  });
});
