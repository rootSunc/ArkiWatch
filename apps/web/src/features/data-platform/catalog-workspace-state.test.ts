import { describe, expect, it } from "vitest";

import {
  hasObservedSourceRecords,
  isCatalogOnlyWorkspace,
  isConnectedWorkspaceSource,
} from "./catalog-workspace-state";

describe("catalog workspace state", () => {
  it("only treats a connected non-pending source as an active feed", () => {
    expect(isConnectedWorkspaceSource({ stage: "background", operational_status: "inactive" })).toBe(false);
    expect(isConnectedWorkspaceSource({ stage: "connected", operational_status: "pending" })).toBe(false);
    expect(isConnectedWorkspaceSource({ stage: "connected", operational_status: "healthy" })).toBe(true);
    expect(isConnectedWorkspaceSource({ stage: "connected", operational_status: "stale" })).toBe(true);
  });

  it("keeps catalog categories catalog-only even when source metadata exists", () => {
    expect(
      isCatalogOnlyWorkspace({
        stage: "background",
        sources: [
          { stage: "background", operational_status: "inactive" } as never,
          { stage: "background", operational_status: "inactive" } as never,
        ],
      }),
    ).toBe(true);
    expect(
      isCatalogOnlyWorkspace({
        stage: "background",
        sources: [{ stage: "connected", operational_status: "healthy" } as never],
      }),
    ).toBe(false);
  });

  it("distinguishes a missing ingest count from an observed zero", () => {
    expect(hasObservedSourceRecords([{ records_ingested: null }])).toBe(false);
    expect(hasObservedSourceRecords([{ records_ingested: 0 }])).toBe(true);
  });
});
