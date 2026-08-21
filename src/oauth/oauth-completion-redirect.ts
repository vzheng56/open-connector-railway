const allowedCompletionRedirects = new Set(["tikpal://inbox/oauth"]);
const completionStatePattern = /^[A-Za-z0-9_-]{16,128}$/;

export interface OAuthCompletionRedirectInput {
  completionRedirect?: string;
  completionState?: string;
}

/**
 * Validate mobile completion metadata before it is persisted in OAuth state.
 * The redirect is an exact allowlist match, never a caller-controlled URL.
 */
export function validateOAuthCompletionRedirect(input: OAuthCompletionRedirectInput): void {
  if (!input.completionRedirect && !input.completionState) {
    return;
  }
  if (!input.completionRedirect || !allowedCompletionRedirects.has(input.completionRedirect)) {
    throw new Error("completionRedirect is not allowed.");
  }
  if (!input.completionState || !completionStatePattern.test(input.completionState)) {
    throw new Error("completionState must be 16-128 URL-safe characters.");
  }
}

/** Build the allowlisted deep link only after credentials are stored. */
export function createOAuthCompletionRedirectUrl(input: {
  completionRedirect: string;
  completionState: string;
  service: string;
}): string {
  validateOAuthCompletionRedirect(input);
  const target = new URL(input.completionRedirect);
  target.searchParams.set("status", "connected");
  target.searchParams.set("provider", input.service);
  target.searchParams.set("state", input.completionState);
  return target.toString();
}
