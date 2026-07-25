import type { ActionDefinition } from "../../core/types.ts";

import { describe, expect, it } from "vitest";
import { renderActionMarkdown } from "./action-markdown.ts";

const action: ActionDefinition = {
  id: "github.delete_repository",
  service: "github",
  name: "delete_repository",
  description: "Delete a repository.",
  requiredScopes: [],
  providerPermissions: [],
  inputSchema: { type: "object" },
  outputSchema: { type: "object" },
};

describe("renderActionMarkdown", () => {
  it("uses the configured public origin in execution examples", () => {
    const markdown = renderActionMarkdown(action, {
      publicOrigin: "https://open-connector-production-3209.up.railway.app/",
    });

    expect(markdown).toContain(
      "https://open-connector-production-3209.up.railway.app/v1/actions/github.delete_repository",
    );
    expect(markdown).not.toContain("localhost:3000");
  });

  it("renders the current execution policy decision and decisive rule", () => {
    const markdown = renderActionMarkdown(action, {
      publicOrigin: "http://localhost:3000",
      policy: {
        allowed: false,
        code: "action_blocked",
        message: "Action is blocked.",
        checks: [{ source: "runtime", outcome: "block_match", rule: "github.delete_repository" }],
      },
    });

    expect(markdown).toContain("## Execution Policy");
    expect(markdown).toContain("Denied: Action is blocked.");
    expect(markdown).toContain("`runtime`: `block_match` via `github.delete_repository`");
  });
});
