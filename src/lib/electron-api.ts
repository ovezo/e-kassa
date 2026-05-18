/**
 * Call into the Electron main process (IPC). When `window.unikassa` is missing
 * (e.g. you opened the app in a normal browser during `next dev`), the same
 * channels are forwarded to `/api/ipc` so UI and DB logic stay in sync.
 */
export async function unikassaInvoke<T>(
  channel: string,
  payload?: unknown,
): Promise<T> {
  if (typeof window === "undefined") {
    throw new Error("unikassaInvoke must run in the browser.");
  }

  if (window.unikassa) {
    return window.unikassa.invoke(channel, payload) as Promise<T>;
  }

  if (process.env.NODE_ENV === "development") {
    const res = await fetch("/api/ipc/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ channel, payload }),
    });
    const text = await res.text();
    let data: unknown;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      throw new Error(`IPC bridge returned non-JSON (${res.status}): ${text}`);
    }
    if (!res.ok) {
      const msg =
        typeof data === "object" && data !== null && "error" in data
          ? String((data as { error: unknown }).error)
          : text;
      throw new Error(msg || `IPC bridge error ${res.status}`);
    }
    return data as T;
  }

  throw new Error(
    "uniKassa IPC is not available. Use Electron, or run `npm run dev:web` / `npm run dev` and open the app in a browser while NODE_ENV=development.",
  );
}
