import { describe, expect, it } from "vitest";

import { provider } from "./definition.ts";

describe("Todoist provider OAuth", () => {
  it("uses Todoist's provider-defined read/write scope", () => {
    const oauth = provider.auth.find((entry) => entry.type === "oauth2");

    expect(oauth?.scopes).toEqual(["data:read_write"]);
    expect(oauth?.scopeSeparator).toBe(",");
  });
});
