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
