import { describe, expect, it } from "vitest";
import { createOAuthCompletionRedirectUrl, validateOAuthCompletionRedirect } from "./oauth-completion-redirect.ts";

describe("OAuth mobile completion redirect", () => {
  it("allows only the exact Tikpal Inbox callback", () => {
    expect(() =>
      validateOAuthCompletionRedirect({
        completionRedirect: "tikpal://inbox/oauth",
        completionState: "abcdefghijklmnop",
      }),
    ).not.toThrow();
    expect(() =>
      validateOAuthCompletionRedirect({
        completionRedirect: "https://attacker.example/callback",
        completionState: "abcdefghijklmnop",
      }),
    ).toThrow("completionRedirect is not allowed");
    expect(() =>
      validateOAuthCompletionRedirect({
        completionRedirect: "tikpal://inbox/oauth?next=https://attacker.example",
        completionState: "abcdefghijklmnop",
      }),
    ).toThrow("completionRedirect is not allowed");
  });

  it("builds a callback with server-owned completion fields", () => {
    expect(
      createOAuthCompletionRedirectUrl({
        completionRedirect: "tikpal://inbox/oauth",
        completionState: "abcdefghijklmnop",
        service: "gmail",
      }),
    ).toBe("tikpal://inbox/oauth?status=connected&provider=gmail&state=abcdefghijklmnop");
  });
});
