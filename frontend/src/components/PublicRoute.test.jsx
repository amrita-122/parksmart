import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { PublicRoute } from "./PublicRoute";

const renderRoute = () =>
  render(
    <MemoryRouter initialEntries={["/signin"]}>
      <Routes>
        <Route path="/" element={<p>home page</p>} />
        <Route
          path="/signin"
          element={
            <PublicRoute>
              <p>sign in form</p>
            </PublicRoute>
          }
        />
      </Routes>
    </MemoryRouter>
  );

describe("PublicRoute", () => {
  it("shows the page to a signed-out visitor", () => {
    renderRoute();
    expect(screen.getByText("sign in form")).toBeInTheDocument();
  });

  it("redirects a signed-in user to /", () => {
    localStorage.setItem("token", "anything");
    renderRoute();
    expect(screen.getByText("home page")).toBeInTheDocument();
  });
});
