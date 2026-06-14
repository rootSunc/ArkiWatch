import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { SessionUser } from "@/features/auth/config";

import { PersonalSettingsPage } from "./personal-settings";

const user: SessionUser = {
  id: "user-1",
  email: "user@example.com",
  name: "Test User",
  locale: "en-US",
  timezone: "Europe/Helsinki",
  status: "ACTIVE",
};

describe("PersonalSettingsPage", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("keeps setup focused while exposing the four personal context steps", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json(
          { locations: [], preferences: null, commuteProfiles: [], channels: [] },
          { status: 200 },
        ),
      ),
    );

    render(<PersonalSettingsPage user={user} />);

    expect(await screen.findByRole("heading", { name: "Personal setup" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Set default location/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Define preferences/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Add commute profile/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Connect Telegram/ })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Add a location" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /^Connect Telegram/ }));
    const telegramInput = screen.getByLabelText("Telegram chat ID");
    fireEvent.change(telegramInput, { target: { value: "123456" } });
    expect(telegramInput).toHaveValue("123456");
  });

  it("saves an existing location by id instead of creating a duplicate", async () => {
    const context = {
      locations: [
        {
          id: "location-1",
          user_id: "user-1",
          label: "Home",
          country_code: "FI",
          city: "Helsinki",
          district: null,
          lat: 60.1699,
          lon: 24.9384,
          is_default: true,
          created_at: "2026-04-12T08:00:00Z",
        },
        {
          id: "location-2",
          user_id: "user-1",
          label: "Office",
          country_code: "FI",
          city: "Espoo",
          district: null,
          lat: 60.2055,
          lon: 24.6559,
          is_default: false,
          created_at: "2026-04-12T08:00:00Z",
        },
      ],
      preferences: null,
      commuteProfiles: [],
      channels: [],
    };
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === "POST") {
        return Response.json(context, { status: 200 });
      }
      return Response.json(context, { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<PersonalSettingsPage user={user} />);

    const cityInput = await screen.findByLabelText("City");
    expect(screen.getByRole("button", { name: "Add another location" })).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Edit" })).toHaveLength(2);
    fireEvent.change(cityInput, { target: { value: "Vantaa" } });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => {
      expect(fetchMock.mock.calls.some(([, init]) => init?.method === "POST")).toBe(true);
    });
    const postCall = fetchMock.mock.calls.find(([, init]) => init?.method === "POST");
    const body = JSON.parse(String(postCall?.[1]?.body));
    expect(body).toMatchObject({
      resource: "locations",
      payload: { id: "location-1", city: "Vantaa" },
    });
  });

  it("can pause an existing commute profile without removing its saved route", async () => {
    const context = {
      locations: [
        {
          id: "location-1",
          user_id: "user-1",
          label: "Home",
          country_code: "FI",
          city: "Helsinki",
          district: null,
          lat: 60.1699,
          lon: 24.9384,
          is_default: true,
          created_at: "2026-04-12T08:00:00Z",
        },
        {
          id: "location-2",
          user_id: "user-1",
          label: "Office",
          country_code: "FI",
          city: "Espoo",
          district: null,
          lat: 60.2055,
          lon: 24.6559,
          is_default: false,
          created_at: "2026-04-12T08:00:00Z",
        },
      ],
      preferences: null,
      commuteProfiles: [
        {
          id: "commute-1",
          user_id: "user-1",
          name: "Weekday commute",
          origin_location_id: "location-1",
          destination_location_id: "location-2",
          preferred_mode: "TRANSIT",
          departure_time_local: "08:00",
          weekdays: [1, 2, 3, 4, 5],
          is_active: true,
          created_at: "2026-04-12T08:00:00Z",
          updated_at: "2026-04-12T08:00:00Z",
        },
      ],
      channels: [],
    };
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      void input;
      return Response.json(context, { status: init?.method === "POST" ? 200 : 200 });
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<PersonalSettingsPage user={user} />);

    await screen.findByRole("heading", { name: "Personal setup" });
    fireEvent.click(screen.getByRole("button", { name: /^Add commute profile/ }));
    const activeToggle = screen.getByLabelText("Use this commute profile for daily guidance");
    expect(activeToggle).toBeChecked();
    fireEvent.click(activeToggle);
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => {
      expect(fetchMock.mock.calls.some(([, init]) => init?.method === "POST")).toBe(true);
    });
    const postCall = fetchMock.mock.calls.find(([, init]) => init?.method === "POST");
    const body = JSON.parse(String(postCall?.[1]?.body));
    expect(body).toMatchObject({
      resource: "commuteProfiles",
      payload: { id: "commute-1", is_active: false },
    });
  });

  it("can disable Telegram delivery while keeping its chat id", async () => {
    const context = {
      locations: [],
      preferences: null,
      commuteProfiles: [],
      channels: [
        {
          id: "channel-1",
          user_id: "user-1",
          channel_type: "TELEGRAM",
          external_id: "123456",
          is_verified: true,
          is_active: true,
          created_at: "2026-04-12T08:00:00Z",
          updated_at: "2026-04-12T08:00:00Z",
        },
      ],
    };
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      void input;
      void init;
      return Response.json(context, { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<PersonalSettingsPage user={user} />);

    await screen.findByRole("heading", { name: "Personal setup" });
    fireEvent.click(screen.getByRole("button", { name: /^Connect Telegram/ }));
    const activeToggle = screen.getByLabelText("Enable Telegram delivery");
    expect(activeToggle).toBeChecked();
    fireEvent.click(activeToggle);
    fireEvent.click(screen.getByRole("button", { name: "Save Telegram" }));

    await waitFor(() => {
      expect(fetchMock.mock.calls.some(([, init]) => init?.method === "POST")).toBe(true);
    });
    const postCall = fetchMock.mock.calls.find(([, init]) => init?.method === "POST");
    const body = JSON.parse(String(postCall?.[1]?.body));
    expect(body).toMatchObject({
      resource: "channels",
      payload: { channel_type: "TELEGRAM", external_id: "123456", is_active: false },
    });
  });
});
