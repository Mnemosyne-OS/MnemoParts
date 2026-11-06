/**
 * PartsAgentActions — serves Parts' agent actions (doc 149) while this window is open.
 *
 * A CHILD that renders nothing, never a hook in App: App is mounted on the person's board while
 * the app runs, and a hook added to it breaks the order of its hooks under hot reload. The
 * handlers live in `partsAgent.ts`; this only keeps their view of the app fresh (a ref
 * written every render) and subscribes ONCE.
 */
import { useEffect, useRef } from 'react';
import { MnemoCartridgeSDK } from '@mnemosyne_os/cartridge-sdk';
import { APP_ID } from './store';
import { partsAgentHandlers, type PartsAgentContext } from './partsAgent';

const sdk = new MnemoCartridgeSDK(APP_ID);
const inShell = (): boolean => typeof window !== 'undefined' && window.parent !== window;

export function PartsAgentActions(props: PartsAgentContext) {
  const latest = useRef(props);
  latest.current = props;

  useEffect(() => {
    // outside the shell nobody calls (a plain tab, the tests): no subscription, no timer
    if (!inShell()) return undefined;
    if (typeof sdk.onAgentActions !== 'function') {
      // An iframe served an older SDK build: it must not take the window down.
      console.warn('[Parts] this SDK build has no onAgentActions; reload the cartridge to serve agent actions');
      return undefined;
    }
    const sub = sdk.onAgentActions(partsAgentHandlers(() => latest.current));
    sub.ready.catch((err: unknown) => console.warn('[Parts] agent actions not served:', err instanceof Error ? err.message : err));
    return () => sub.off();
  }, []);

  return null;
}
