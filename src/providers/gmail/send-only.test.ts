import type { CredentialValidators } from "../../core/types.ts";

import { describe, expect, it, vi } from "vitest";
import { credentialValidators, gmailActionHandlers } from "./executors.ts";
import { gmailSendScope } from "./scopes.ts";

describe("Gmail send-only credentials", () => {
  it("keeps the actual scope without calling the mailbox profile endpoint", async () => {
    const fetcher = vi.fn<typeof fetch>();
    const credential: Parameters<NonNullable<CredentialValidators["oauth2"]>>[0] = {
      authType: "oauth2",
      accessToken: "test-token",
      tokenType: "Bearer",
      metadata: { scope: gmailSendScope },
      profile: { accountId: "test-account", displayName: "Test account", grantedScopes: [gmailSendScope] },
    };
    const result = await credentialValidators.oauth2?.(credential, { fetcher });
    expect(result).toEqual({ grantedScopes: [gmailSendScope] });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("sends with one messages.send request and does not read the sent email", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response(JSON.stringify({ id: "message-1", threadId: "thread-1" }), { status: 200 }));
    const result = await gmailActionHandlers.send_email(
      { to: "test@example.com", subject: "Test", body: "Body" },
      { userId: "me", accessToken: "test-token", fetcher },
    );
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(String(fetcher.mock.calls[0]?.[0])).toBe("https://gmail.googleapis.com/gmail/v1/users/me/messages/send");
    expect(fetcher.mock.calls[0]?.[1]?.method).toBe("POST");
    expect(result).toMatchObject({ messageId: "message-1" });
  });
});
