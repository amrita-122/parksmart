import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { ProtectedRoute } from "./ProtectedRoute";

// jwt-decode only reads the payload, so an unsigned token is enough here.
const makeToken = (payload) => {
  const b64 = (o) => btoa(JSON.stringify(o)).replace(/=/g, "");
  return `${b64({ alg: "none" })}.${b64(payload)}.sig`;
};
const inHours = (h) => Math.floor(Date.now() / 1000) + h * 3600;

const renderRoute = (props = {}) =>
  render(
    <MemoryRouter initialEntries={["/secret"]}>
      <Routes>
        <Route path="/signin" element={<p>sign in page</p>} />
        <Route path="/" element={<p>home page</p>} />
        <Route
          path="/secret"
          element={
            <ProtectedRoute {...props}>
              <p>secret content</p>
            </ProtectedRoute>
          }
        />
      </Routes>
    </MemoryRouter>
  );

describe("ProtectedRoute", () => {
  it("redirects to /signin without a token", () => {
    renderRoute();
    expect(screen.getByText("sign in page")).toBeInTheDocument();
  });

  it("renders children for a valid token", () => {
    localStorage.setItem("token", makeToken({ exp: inHours(1), role: "user" }));
    renderRoute();
    expect(screen.getByText("secret content")).toBeInTheDocument();
  });

  it("removes an expired token and redirects to /signin", () => {
    localStorage.setItem("token", makeToken({ exp: inHours(-1), role: "user" }));
    renderRoute();
    expect(screen.getByText("sign in page")).toBeInTheDocument();
    expect(localStorage.getItem("token")).toBeNull();
  });

  it("redirects to /signin for a malformed token", () => {
    localStorage.setItem("token", "not-a-jwt");
    renderRoute();
    expect(screen.getByText("sign in page")).toBeInTheDocument();
  });

  it("sends a non-admin away from an admin-only route", () => {
    localStorage.setItem("token", makeToken({ exp: inHours(1), role: "user" }));
    renderRoute({ adminOnly: true });
    expect(screen.getByText("home page")).toBeInTheDocument();
  });

  it("lets an admin into an admin-only route", () => {
    localStorage.setItem("token", makeToken({ exp: inHours(1), role: "admin" }));
    renderRoute({ adminOnly: true });
    expect(screen.getByText("secret content")).toBeInTheDocument();
  });
});
