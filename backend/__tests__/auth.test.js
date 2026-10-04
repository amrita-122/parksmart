jest.mock("../socket", () => ({
  init: jest.fn(),
  getIO: jest.fn(() => ({ emit: jest.fn() })),
}));
jest.mock("../config/db", () => jest.fn());
jest.mock("../config/passport", () => {});

// Mock DB models
jest.mock("../models/User");
jest.mock("../models/OtpModel");

const request = require("supertest");
const app = require("../app");
const User = require("../models/User");
const OTP = require("../models/OtpModel");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

process.env.JWT_SECRET = "test-secret";

describe("POST /api/auth/login", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns 400 if credentials are missing", async () => {
    const res = await request(app).post("/api/auth/login").send({});
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/required/i);
  });

  it("returns 404 if user not found", async () => {
    User.findOne = jest.fn().mockResolvedValue(null);
    const res = await request(app)
      .post("/api/auth/login")
      .send({ emailorPhone: "nobody@test.com", password: "pass" });
    expect(res.status).toBe(404);
  });

  it("returns 404 on wrong password", async () => {
    const hashed = await bcrypt.hash("correctpass", 10);
    User.findOne = jest.fn().mockResolvedValue({ _id: "uid", email: "a@b.com", password: hashed, role: "user" });
    const res = await request(app)
      .post("/api/auth/login")
      .send({ emailorPhone: "a@b.com", password: "wrongpass" });
    expect(res.status).toBe(404);
  });

  it("returns 200 and token on valid credentials", async () => {
    const hashed = await bcrypt.hash("secret", 10);
    User.findOne = jest.fn().mockResolvedValue({ _id: "uid123", email: "a@b.com", password: hashed, role: "user" });
    const res = await request(app)
      .post("/api/auth/login")
      .send({ emailorPhone: "a@b.com", password: "secret" });
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("token");
    const decoded = jwt.verify(res.body.token, "test-secret");
    expect(decoded.email).toBe("a@b.com");
  });
});

describe("POST /api/auth/signup", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns 409 if email already exists", async () => {
    User.findOne = jest.fn().mockResolvedValue({ email: "exists@test.com" });
    const res = await request(app).post("/api/auth/signup").send({
      name: "Test",
      email: "exists@test.com",
      phoneNumber: "1234567890",
      password: "pass",
      otp: "123456",
    });
    expect(res.status).toBe(409);
  });

  it("returns 400 on invalid OTP", async () => {
    User.findOne = jest.fn().mockResolvedValue(null);
    OTP.find = jest.fn().mockReturnValue({
      sort: jest.fn().mockReturnValue({
        limit: jest.fn().mockResolvedValue([{ otp: "999999" }]),
      }),
    });
    const res = await request(app).post("/api/auth/signup").send({
      name: "Test",
      email: "new@test.com",
      phoneNumber: "1234567890",
      password: "pass",
      otp: "000000",
    });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/OTP is not valid/i);
  });
});
