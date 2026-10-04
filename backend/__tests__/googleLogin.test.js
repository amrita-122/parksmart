jest.mock("../socket", () => ({ init: jest.fn(), getIO: jest.fn(() => ({ emit: jest.fn() })) }));
jest.mock("../config/db", () => jest.fn());
jest.mock("../models/User");
jest.mock("../models/parking_db");
jest.mock("../models/payments");

process.env.JWT_SECRET = "test-secret";
process.env.GOOGLE_CLIENT_ID = "test-client-id";
process.env.GOOGLE_CLIENT_SECRET = "test-client-secret";
process.env.CLIENT_URL = "http://client.test";

const request = require("supertest");
const jwt = require("jsonwebtoken");
const User = require("../models/User");
const { verifyGoogleProfile } = require("../config/googleVerify");
const app = require("../app"); // loads the real passport Google strategy

describe("verifyGoogleProfile", () => {
  const profile = { displayName: "Ada", emails: [{ value: "ada@test.com" }] };
  const run = (p = profile) =>
    new Promise((resolve) => verifyGoogleProfile("at", "rt", p, (err, user) => resolve({ err, user })));

  beforeEach(() => jest.clearAllMocks());

  it("signs in an existing user with an expiring JWT and no password hash", async () => {
    User.findOne = jest.fn().mockResolvedValue({ _id: "u1", email: "ada@test.com", role: "user", password: "hash" });
    const { err, user } = await run();
    expect(err).toBeNull();
    expect(user).not.toHaveProperty("password");
    const decoded = jwt.verify(user.token, "test-secret");
    expect(decoded).toMatchObject({ id: "u1", email: "ada@test.com" });
    expect(decoded.exp).toBeGreaterThan(decoded.iat);
  });

  it("creates a google user without a phone number or password", async () => {
    User.findOne = jest.fn().mockResolvedValue(null);
    const save = jest.fn().mockResolvedValue(undefined);
    User.mockImplementation((data) => ({ _id: "new1", role: "user", ...data, save }));
    const { err, user } = await run();
    expect(err).toBeNull();
    expect(user.id).toBe("new1");
    const created = User.mock.calls[0][0];
    expect(created).toMatchObject({ email: "ada@test.com", provider: "google", password: null });
    expect(created).not.toHaveProperty("phoneNumber");
    expect(save).toHaveBeenCalled();
  });

  it("rejects a profile with no email", async () => {
    const { err, user } = await run({ displayName: "No Email" });
    expect(err).toBeNull();
    expect(user).toBe(false);
  });

  it("passes database errors to passport", async () => {
    User.findOne = jest.fn().mockRejectedValue(new Error("db down"));
    const { err } = await run();
    expect(err).toBeInstanceOf(Error);
  });
});

describe("redirect-based Google login routes", () => {
  it("GET /api/auth/google sends the browser to Google with an absolute callback", async () => {
    const res = await request(app).get("/api/auth/google");
    expect(res.status).toBe(302);
    const location = new URL(res.headers.location);
    expect(location.hostname).toBe("accounts.google.com");
    expect(location.searchParams.get("client_id")).toBe("test-client-id");
    expect(location.searchParams.get("redirect_uri")).toMatch(/^https?:\/\/.+\/api\/auth\/google\/callback$/);
  });

  it("the callback sends failures back to the sign-in page", async () => {
    const res = await request(app).get("/api/auth/google/callback?error=access_denied");
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe("http://client.test/signin");
  });
});
