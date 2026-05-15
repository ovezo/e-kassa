import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("ikassir", {
  invoke: (channel: string, payload?: unknown) =>
    ipcRenderer.invoke("ikassir", { channel, payload }),
});
