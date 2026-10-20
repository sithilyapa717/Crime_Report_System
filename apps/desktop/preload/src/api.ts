// The typed API the renderer sees as `window.excise`. Renderer code imports these types only.
import type { CallResult, Channel, Handlers } from '@excise/desktop-main/src/host';

export type { CallResult, Channel, Handlers };

export interface ExciseApi {
  /**
   * Calls a service in the main process. Never throws for service errors: check `ok`.
   * Example: `const r = await window.excise.call('cr.get', id); if (r.ok) use(r.value);`
   */
  call<C extends Channel>(
    channel: C,
    ...args: Parameters<Handlers[C]>
  ): Promise<CallResult<Awaited<ReturnType<Handlers[C]>>>>;
}

declare global {
  interface Window {
    excise: ExciseApi;
  }
}
