import type { ProviderDefinition } from "../../core/types.ts";

import { todoistActions } from "./actions.ts";

const service = "todoist";

export const provider: ProviderDefinition = {
  service,
  displayName: "Todoist",
  categories: ["Productivity"],
  authTypes: ["oauth2", "api_key"],
  auth: [
    {
      type: "oauth2",
      authorizationUrl: "https://todoist.com/oauth/authorize",
      tokenUrl: "https://todoist.com/oauth/access_token",
      // Todoist's OAuth endpoint accepts provider scopes, while the runtime
      // exposes the stable logical scopes `todoist.read`/`todoist.write` after
      // credential validation. `data:read_write` is the least provider scope
      // that covers the V1 project/task read-write contract.
      scopes: ["data:read_write"],
      scopeSeparator: ",",
      tokenEndpointAuthMethod: "client_secret_post",
    },
    {
      type: "api_key",
      label: "Access Token",
      placeholder: "todoist_access_token",
      description:
        "Paste a Todoist OAuth access token or personal API token. It is sent with the Authorization Bearer header.",
    },
  ],
  homepageUrl: "https://todoist.com",
  actions: todoistActions,
};
