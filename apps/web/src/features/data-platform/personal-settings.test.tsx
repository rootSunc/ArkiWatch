import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { StrictMode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { PersonalSettingsPage } from "./personal-settings";

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

    render(<PersonalSettingsPage />);

    expect(await screen.findByRole("heading", { name: "Personal context" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Set default location/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Define preferences/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Add commute profile/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Connect Telegram/ })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Add a location" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Back to Today" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Language: 中文" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Standard" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Light" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Dark" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByText("Personal context is stored with your account. Public feeds are fetched without it.")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Dark" }));
    expect(screen.getByRole("button", { name: "Dark" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Light" })).toHaveAttribute("aria-pressed", "false");

    fireEvent.click(screen.getByRole("button", { name: /^Connect Telegram/ }));
    const telegramInput = screen.getByLabelText("Telegram chat ID");
    fireEvent.change(telegramInput, { target: { value: "123456" } });
    expect(telegramInput).toHaveValue("123456");
  });

  it("keeps the browser title aligned with the selected language", async () => {
    window.localStorage.setItem("arkiwatch-language", "en");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json(
          { locations: [], preferences: null, commuteProfiles: [], channels: [] },
          { status: 200 },
        ),
      ),
    );

    render(<PersonalSettingsPage />);

    await screen.findByRole("heading", { name: "Personal context" });
    await waitFor(() => expect(document.title).toBe("Personal context | ArkiWatch"));

    fireEvent.click(screen.getByRole("button", { name: "Language: 中文" }));

    await screen.findByRole("heading", { name: "个人情境" });
    await waitFor(() => expect(document.title).toBe("个人情境 | ArkiWatch"));
    window.localStorage.setItem("arkiwatch-language", "en");
  });

  it("announces loading separately from saving", async () => {
    let resolveContext!: (response: Response) => void;
    vi.stubGlobal(
      "fetch",
      vi.fn(
        () =>
          new Promise<Response>((resolve) => {
            resolveContext = resolve;
          }),
      ),
    );

    render(<PersonalSettingsPage />);

    expect(screen.getByRole("status")).toHaveTextContent("Loading your personal context…");
    expect(screen.queryByText("Saving…")).not.toBeInTheDocument();

    resolveContext(
      Response.json(
        { locations: [], preferences: null, commuteProfiles: [], channels: [] },
        { status: 200 },
      ),
    );
    await screen.findByRole("heading", { name: "Personal context" });
  });

  it("does not expose backend details when personal context loading fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json(
          { detail: "database password=legacy-secret" },
          { status: 500 },
        ),
      ),
    );

    render(<PersonalSettingsPage />);

    await waitFor(() => {
      const notice = screen.getByRole("alert");
      expect(notice).toHaveTextContent(
        "Personal settings could not be loaded or updated. Check the fields and try again.",
      );
      expect(notice).not.toHaveTextContent("legacy-secret");
    });
  });

  it("does not expose backend details when saving personal context fails", async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === "POST") {
        return Response.json(
          { detail: "database password=legacy-secret" },
          { status: 500 },
        );
      }

      return Response.json(
        { locations: [], preferences: null, commuteProfiles: [], channels: [] },
        { status: 200 },
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<PersonalSettingsPage />);

    await screen.findByLabelText("City");
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

    const notice = await screen.findByRole("alert");
    expect(notice).toHaveTextContent(
      "Personal settings could not be loaded or updated. Check the fields and try again.",
    );
    expect(notice).not.toHaveTextContent("legacy-secret");
  });

  it("blocks invalid location values before sending them to the API", async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      void _input;
      void init;
      return Response.json(
        { locations: [], preferences: null, commuteProfiles: [], channels: [] },
        { status: 200 },
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<PersonalSettingsPage />);

    await screen.findByLabelText("City");
    fireEvent.change(screen.getByLabelText("Latitude"), { target: { value: "" } });
    fireEvent.change(screen.getByLabelText("Country code"), { target: { value: "F" } });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Enter a label and city, use a two-letter country code, and keep latitude between -90 and 90 and longitude between -180 and 180.",
    );
    expect(fetchMock.mock.calls.filter(([, init]) => init?.method === "POST")).toHaveLength(0);

    fireEvent.change(screen.getByLabelText("Latitude"), { target: { value: "91" } });
    fireEvent.change(screen.getByLabelText("Country code"), { target: { value: "FI" } });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

    expect(fetchMock.mock.calls.filter(([, init]) => init?.method === "POST")).toHaveLength(0);
  });

  it("blocks invalid notification limits before sending preferences", async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      void _input;
      void init;
      return Response.json(
        { locations: [], preferences: null, commuteProfiles: [], channels: [] },
        { status: 200 },
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<PersonalSettingsPage />);

    await screen.findByLabelText("City");
    fireEvent.click(screen.getByRole("button", { name: /^Define preferences/ }));
    const notifications = screen.getByLabelText("Maximum notifications per day");
    fireEvent.change(notifications, { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Set maximum notifications to a whole number from 1 to 20.",
    );
    expect(fetchMock.mock.calls.filter(([, init]) => init?.method === "POST")).toHaveLength(0);

    fireEvent.change(notifications, { target: { value: "21" } });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

    expect(fetchMock.mock.calls.filter(([, init]) => init?.method === "POST")).toHaveLength(0);
  });

  it("blocks incomplete commute profiles before sending them", async () => {
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
      void _input;
      void init;
      return Response.json(context, { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<PersonalSettingsPage />);

    await screen.findByLabelText("City");
    fireEvent.click(screen.getByRole("button", { name: /^Add commute profile/ }));
    fireEvent.change(screen.getByLabelText("Profile name"), { target: { value: "" } });
    const commuteDeparture = screen.getAllByLabelText("Departure time")[1];
    fireEvent.change(commuteDeparture, { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Enter a profile name, a valid departure time, and at least one weekday.",
    );
    expect(fetchMock.mock.calls.filter(([, init]) => init?.method === "POST")).toHaveLength(0);

    for (const day of ["Mon", "Tue", "Wed", "Thu", "Fri"]) {
      fireEvent.click(screen.getByText(day, { selector: "button" }));
    }
    fireEvent.change(screen.getByLabelText("Profile name"), { target: { value: "Weekday commute" } });
    fireEvent.change(commuteDeparture, { target: { value: "08:00" } });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

    expect(fetchMock.mock.calls.filter(([, init]) => init?.method === "POST")).toHaveLength(0);
  });

  it("saves the quick context controls in order without cancelling earlier resources", async () => {
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
      preferences: {
        id: "preference-1",
        user_id: "user-1",
        cares_energy: false,
        cares_air_quality: true,
        cares_weather: true,
        cares_commute: true,
        allergy_sensitive: false,
        quiet_hours_start: "22:00",
        quiet_hours_end: "07:00",
        max_notifications_per_day: 6,
        created_at: "2026-04-12T08:00:00Z",
        updated_at: "2026-04-12T08:00:00Z",
      },
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
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      void _input;
      void init;
      return Response.json(context, { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<PersonalSettingsPage />);

    await screen.findByLabelText("City");
    fireEvent.click(screen.getByRole("button", { name: "Sensitive" }));
    fireEvent.change(screen.getByLabelText("Departure time"), { target: { value: "07:30" } });
    fireEvent.click(screen.getByRole("button", { name: "Save context" }));

    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Saved"));

    const postCalls = fetchMock.mock.calls.filter(([, init]) => init?.method === "POST");
    expect(postCalls).toHaveLength(3);
    expect(postCalls.map(([, init]) => JSON.parse(String(init?.body)).resource)).toEqual([
      "locations",
      "preferences",
      "commuteProfiles",
    ]);
    expect(JSON.parse(String(postCalls[1]?.[1]?.body))).toMatchObject({
      resource: "preferences",
      payload: { allergy_sensitive: true },
    });
    expect(JSON.parse(String(postCalls[2]?.[1]?.body))).toMatchObject({
      resource: "commuteProfiles",
      payload: { departure_time_local: "07:30" },
    });
  });

  it("keeps the latest context response when StrictMode replays the initial request", async () => {
    const firstContext = {
      locations: [
        {
          id: "location-old",
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
      ],
      preferences: null,
      commuteProfiles: [],
      channels: [],
    };
    const secondContext = {
      ...firstContext,
      locations: [{ ...firstContext.locations[0], id: "location-new", city: "Espoo" }],
    };
    let resolveFirst!: (response: Response) => void;
    let resolveSecond!: (response: Response) => void;
    const firstRequest = new Promise<Response>((resolve) => {
      resolveFirst = resolve;
    });
    const secondRequest = new Promise<Response>((resolve) => {
      resolveSecond = resolve;
    });
    let callCount = 0;
    const fetchMock = vi.fn(() => {
      callCount += 1;
      return callCount === 1 ? firstRequest : secondRequest;
    });
    vi.stubGlobal("fetch", fetchMock);

    render(
      <StrictMode>
        <PersonalSettingsPage />
      </StrictMode>,
    );

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    resolveSecond(Response.json(secondContext, { status: 200 }));
    await waitFor(() => expect(screen.getByLabelText("City")).toHaveValue("Espoo"));

    resolveFirst(Response.json(firstContext, { status: 200 }));
    await waitFor(() => expect(screen.getByLabelText("City")).toHaveValue("Espoo"));
  });

  it("cancels the context request when the settings page unmounts", async () => {
    let requestSignal: AbortSignal | undefined;
    const fetchMock = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
      requestSignal = init?.signal ?? undefined;
      return new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener(
          "abort",
          () => reject(new DOMException("Request closed", "AbortError")),
          { once: true },
        );
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const { unmount } = render(<PersonalSettingsPage />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());

    unmount();

    expect(requestSignal?.aborted).toBe(true);
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

    render(<PersonalSettingsPage />);

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

    render(<PersonalSettingsPage />);

    await screen.findByRole("heading", { name: "Personal context" });
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

  it("keeps a trailing comma in the route field and saves distinct names", async () => {
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
    const fetchMock = vi.fn(async () => Response.json(context, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    render(<PersonalSettingsPage />);
    fireEvent.click(await screen.findByRole("button", { name: /^Add commute profile/ }));
    const routes = screen.getByLabelText("Routes");
    fireEvent.change(routes, { target: { value: "9, " } });
    expect(routes).toHaveValue("9, ");
    fireEvent.change(routes, { target: { value: "9, Kallio" } });
    fireEvent.change(screen.getByLabelText("Stops"), { target: { value: "Kallion virastotalo" } });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => {
      expect(fetchMock.mock.calls.some(([, init]) => init?.method === "POST")).toBe(true);
    });
    const postCall = fetchMock.mock.calls.find(([, init]) => init?.method === "POST");
    expect(JSON.parse(String(postCall?.[1]?.body))).toMatchObject({
      resource: "commuteProfiles",
      payload: { route_names: ["9", "Kallio"], stop_names: ["Kallion virastotalo"] },
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

    render(<PersonalSettingsPage />);

    await screen.findByRole("heading", { name: "Personal context" });
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
