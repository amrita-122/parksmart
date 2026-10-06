// Mock socket.io before importing app (routes call getIO())
jest.mock("../socket", () => ({
  init: jest.fn(),
  getIO: jest.fn(() => ({ emit: jest.fn() })),
}));

// Mock mongoose to prevent real DB connection
jest.mock("../config/db", () => jest.fn());
jest.mock("../config/passport", () => {});

const request = require("supertest");
const app = require("../app");

describe("GET /health", () => {
  it("returns status ok", async () => {
    const res = await request(app).get("/health");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "ok" });
  });
});

describe("hardening", () => {
  it("sends helmet security headers", async () => {
    const res = await request(app).get("/health");
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
    expect(res.headers["x-powered-by"]).toBeUndefined();
  });

  it("rejects oversized JSON bodies", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .send({ emailorPhone: "x".repeat(20 * 1024), password: "y" });
    expect(res.status).toBe(413);
  });

  it("rate limits the payment routes", async () => {
    let last;
    for (let i = 0; i < 31; i++) {
      last = await request(app).post("/api/payment/create-intent").send({});
    }
    expect(last.status).toBe(429);
  });
});
