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
const jwt = require("jsonwebtoken");

process.env.JWT_SECRET = "test-secret";

const makeToken = (payload = { id: "user123", email: "u@test.com" }) =>
  jwt.sign(payload, "test-secret");

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
  it("returns 400 when fields are missing", async () => {
    const res = await request(app).post("/api/parking/add").send({ lotNumber: "A" });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/required/i);
  });

  it("returns 400 if spot already exists", async () => {
    ParkingSpot.findOne = jest.fn().mockResolvedValue({ spotNumber: "1" });
    const res = await request(app)
      .post("/api/parking/add")
      .send({ lotNumber: "A", spotNumber: "1", lat: 49.01, lng: -122.28 });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/already exists/i);
  });

  it("creates a new spot successfully", async () => {
    ParkingSpot.findOne = jest.fn().mockResolvedValue(null);
    const saveMock = jest.fn().mockResolvedValue(undefined);
    ParkingSpot.mockImplementation(() => ({ save: saveMock, spotNumber: "2" }));
    const res = await request(app)
      .post("/api/parking/add")
      .send({ lotNumber: "A", spotNumber: "2", lat: 49.01, lng: -122.28 });
    expect(res.status).toBe(201);
  });
});

describe("POST /api/parking/update-status", () => {
  it("returns 400 on missing data", async () => {
    const res = await request(app).post("/api/parking/update-status").send({});
    expect(res.status).toBe(400);
  });

  it("updates spot status and emits socket event", async () => {
    const updatedSpot = { _id: "s1", spotNumber: "11", isAvailable: false };
    ParkingSpot.findOneAndUpdate = jest.fn().mockResolvedValue(updatedSpot);
    mockEmit.mockClear();

    const res = await request(app)
      .post("/api/parking/update-status")
      .send({ spotNumber: "11", isAvailable: false });

    expect(res.status).toBe(200);
    expect(res.body.updated.spotNumber).toBe("11");
    expect(mockEmit).toHaveBeenCalledWith("spot:updated", updatedSpot);
  });

  it("returns 404 when spot not found", async () => {
    ParkingSpot.findOneAndUpdate = jest.fn().mockResolvedValue(null);
    const res = await request(app)
      .post("/api/parking/update-status")
      .send({ spotNumber: "999", isAvailable: true });
    expect(res.status).toBe(404);
  });
});

describe("POST /api/parking/reserve", () => {
  it("returns 401 without auth token", async () => {
    const res = await request(app).post("/api/parking/reserve").send({});
    expect(res.status).toBe(401);
  });

  it("returns 400 if spot is unavailable", async () => {
    ParkingSpot.findById = jest.fn().mockResolvedValue({ isAvailable: false });
    const res = await request(app)
      .post("/api/parking/reserve")
      .set("Authorization", `Bearer ${makeToken()}`)
      .send({ spotId: "s1", startTime: new Date().toISOString(), endTime: new Date().toISOString() });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/not available/i);
  });

  it("returns 403 if user has no completed payment", async () => {
    ParkingSpot.findById = jest.fn().mockResolvedValue({ isAvailable: true });
    Payment.findOne = jest.fn().mockReturnValue({ sort: jest.fn().mockResolvedValue(null) });
    const startTime = new Date().toISOString();
    const res = await request(app)
      .post("/api/parking/reserve")
      .set("Authorization", `Bearer ${makeToken()}`)
      .send({ spotId: "s1", startTime, endTime: startTime });
    expect(res.status).toBe(403);
    expect(res.body.message).toMatch(/payment/i);
  });
});
