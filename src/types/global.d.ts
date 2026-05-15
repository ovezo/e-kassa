export {};

declare global {
  interface Window {
    ikassir?: {
      invoke<T = unknown>(channel: string, payload?: unknown): Promise<T>;
    };
  }
}
