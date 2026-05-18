import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("unikassa", {
  invoke: (channel: string, payload?: unknown) =>
    ipcRenderer.invoke("unikassa", { channel, payload }),
});
