import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import axios from "axios";
import History from "./History";

vi.mock("axios");

describe("History", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.setItem("token", "tok");
  });

  it("sends the bearer token and lists reservations and payments", async () => {
    axios.get.mockImplementation((url) =>
      Promise.resolve({
        data: url.endsWith("/reservations")
          ? [{ _id: "r1", spotId: { spotNumber: "7" }, status: "completed", startTime: "2026-01-01T10:00:00Z", endTime: "2026-01-01T11:00:00Z" }]
          : [{ _id: "p1", amount: 5, paymentMethod: "card", status: "completed", timestamp: "2026-01-01T09:00:00Z" }],
      })
    );
    render(<History />);

    expect(await screen.findByText("7", { exact: false })).toBeInTheDocument();
    expect(screen.getByText("card", { exact: false })).toBeInTheDocument();
    for (const [, opts] of axios.get.mock.calls) {
      expect(opts.headers.Authorization).toBe("Bearer tok");
    }
  });

  it("shows empty states when there is no history", async () => {
    axios.get.mockResolvedValue({ data: [] });
    render(<History />);
    expect(await screen.findByText("No reservations found.")).toBeInTheDocument();
    expect(screen.getByText("No payments found.")).toBeInTheDocument();
  });
});
