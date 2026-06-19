import { describe, expect, it, vi } from "vitest";

import { handleTabListKeyDown } from "./tab-navigation";

describe("handleTabListKeyDown", () => {
  it("cycles tabs and prevents the browser from scrolling", () => {
    const onChange = vi.fn();
    const preventDefault = vi.fn();

    handleTabListKeyDown(
      { key: "ArrowLeft", preventDefault } as never,
      [{ key: "one" }, { key: "two" }, { key: "three" }],
      "one",
      onChange,
      "test-tab",
    );

    expect(preventDefault).toHaveBeenCalledOnce();
    expect(onChange).toHaveBeenCalledWith("three");
  });

  it("supports Home and End without changing unrelated keys", () => {
    const onChange = vi.fn();
    const preventDefault = vi.fn();
    const tabs = [{ key: "one" }, { key: "two" }, { key: "three" }] as const;

    handleTabListKeyDown(
      { key: "End", preventDefault } as never,
      tabs,
      "one",
      onChange,
      "test-tab",
    );
    handleTabListKeyDown(
      { key: "Enter", preventDefault } as never,
      tabs,
      "one",
      onChange,
      "test-tab",
    );

    expect(onChange).toHaveBeenCalledOnce();
    expect(onChange).toHaveBeenCalledWith("three");
    expect(preventDefault).toHaveBeenCalledOnce();
  });
});
