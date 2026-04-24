// Module-level snapshot of the currently signed-in user, set by AuthProvider.
// Services read this when writing audit-log entries, so mutation functions
// don't need to thread a user arg through every call site.

export type CurrentUserCtx = {
  uid: string;
  initials: string;
};

let current: CurrentUserCtx | null = null;

export function setCurrentUserCtx(ctx: CurrentUserCtx | null): void {
  current = ctx;
}

export function getCurrentUserCtx(): CurrentUserCtx | null {
  return current;
}

export function requireCurrentUserCtx(): CurrentUserCtx {
  if (!current) {
    throw new Error("No signed-in user. Cannot perform this action.");
  }
  return current;
}
