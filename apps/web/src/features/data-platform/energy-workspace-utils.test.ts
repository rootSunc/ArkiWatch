import { describe, expect, it } from "vitest";

import { sourceRecordsMetric } from "./energy-workspace-utils";

type SourceRecordMetricInput = NonNullable<Parameters<typeof sourceRecordsMetric>[0]>;

function sourceWithRecords(records_ingested: number | null): SourceRecordMetricInput {
  return {
    records_ingested,
    operational_status: "pending",
    last_run_status: null,
    last_run_started_at: null,
    last_run_finished_at: null,
  };
}

describe("energy source metrics", () => {
  it("does not turn an unavailable source record count into zero", () => {
    expect(sourceRecordsMetric(null).value).toBe("n/a");
    expect(sourceRecordsMetric(sourceWithRecords(null)).value).toBe("n/a");
  });

  it("keeps an observed zero distinct from an unavailable count", () => {
    expect(sourceRecordsMetric(sourceWithRecords(0)).value).toBe("0");
  });
});
