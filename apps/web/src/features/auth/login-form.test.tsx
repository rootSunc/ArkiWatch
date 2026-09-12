import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { LoginForm } from "./login-form";

const { replace } = vi.hoisted(() => ({ replace: vi.fn() }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace, refresh: vi.fn() }),
}));

describe("LoginForm", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    replace.mockReset();
  });

  it("does not expose backend authentication details", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        Response.json(
          { detail: "database password=legacy-secret" },
          { status: 500 },
        ),
      ),
    );

    render(<LoginForm sessionExpired={false} />);
    fireEvent.change(screen.getByLabelText("Password"), {
      target: { value: "secret" },
    });
    fireEvent.submit(screen.getByRole("button", { name: "Sign in" }).closest("form")!);

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Login failed.");
    expect(alert).not.toHaveTextContent("legacy-secret");
    expect(alert).toHaveFocus();
    await waitFor(() => expect(screen.getByRole("button", { name: "Sign in" })).not.toBeDisabled());
    expect(replace).not.toHaveBeenCalled();
  });
});
