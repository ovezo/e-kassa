export {};

declare global {
  interface Window {
    unikassa?: {
      invoke<T = unknown>(channel: string, payload?: unknown): Promise<T>;
    };
  }
}
