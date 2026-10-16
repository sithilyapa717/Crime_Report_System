// Runs in the sandboxed renderer before the page. Exposes one function and nothing else.
import { contextBridge, ipcRenderer } from 'electron';
import type { ExciseApi } from './api.js';

/** Must match IPC_CHANNEL in apps/desktop/main/src/main.ts. */
const IPC_CHANNEL = 'excise:call';

const api: ExciseApi = {
  call: (channel, ...args) => ipcRenderer.invoke(IPC_CHANNEL, channel, args),
};

contextBridge.exposeInMainWorld('excise', api);
