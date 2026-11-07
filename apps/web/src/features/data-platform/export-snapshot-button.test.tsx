import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ExportSnapshotButton } from "./export-snapshot-button";

describe("ExportSnapshotButton", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("announces progress and failure when the export request cannot finish", async () => {
    let rejectRequest: (reason?: unknown) => void = () => undefined;
    const request = new Promise<Response>((_resolve, reject) => {
      rejectRequest = reject;
    });
    vi.stubGlobal("fetch", vi.fn().mockReturnValue(request));

    render(
      <ExportSnapshotButton
        city="Helsinki"
        date={null}
        language="en"
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Download public snapshot" }));

    expect(screen.getByRole("button", { name: "Preparing public snapshot" })).toHaveAttribute(
      "aria-busy",
      "true",
    );
    expect(screen.getByRole("status")).toHaveTextContent("Preparing public snapshot");

    rejectRequest(new Error("network unavailable"));

    await waitFor(() => {
      expect(screen.getByRole("status")).toHaveTextContent("Snapshot download failed");
    });
    expect(screen.getByRole("button", { name: "Snapshot download failed" })).not.toBeDisabled();
  });

  it("normalizes coverage-area strings to a valid city ref in the export query", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error("offline"));
    vi.stubGlobal("fetch", fetchMock);

    render(
      <ExportSnapshotButton
        city="Espoo/Uusimaa"
        date="2026-08-09"
        language="en"
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Download public snapshot" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });
    const requestedUrl = new URL(String(fetchMock.mock.calls[0][0]));
    expect(requestedUrl.searchParams.get("city")).toBe("espoo");
    expect(requestedUrl.searchParams.get("date")).toBe("2026-08-09");
    expect(requestedUrl.searchParams.get("format")).toBe("csv");
  });
});
