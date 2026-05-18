export type SessionUser = {
  id: string;
  login: string;
  displayName: string;
  role: "ADMIN" | "STAFF";
};

const SESSION_KEY = "unikassa_session";
const SESSION_KEYS_LEGACY = ["me-kassa_session", "ekassa_session"] as const;

export function saveSession(user: SessionUser): void {
  sessionStorage.setItem(SESSION_KEY, JSON.stringify(user));
  for (const key of SESSION_KEYS_LEGACY) {
    sessionStorage.removeItem(key);
  }
}

export function clearSession(): void {
  sessionStorage.removeItem(SESSION_KEY);
  for (const key of SESSION_KEYS_LEGACY) {
    sessionStorage.removeItem(key);
  }
}

export function readSession(): SessionUser | null {
  let raw = sessionStorage.getItem(SESSION_KEY);
  if (!raw) {
    for (const key of SESSION_KEYS_LEGACY) {
      raw = sessionStorage.getItem(key);
      if (raw) break;
    }
  }
  if (!raw) return null;
  try {
    return JSON.parse(raw) as SessionUser;
  } catch {
    return null;
  }
}
