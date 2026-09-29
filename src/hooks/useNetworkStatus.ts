import { useState, useEffect, useRef } from 'react';

const PING_URL      = 'https://www.gstatic.com/generate_204';
const PING_INTERVAL = 15000;  // check every 15 seconds
const PING_TIMEOUT  = 8000;   // wait up to 8s before declaring offline
const INITIAL_DELAY = 6000;   // wait 6s after app start before first check
                               // prevents false-offline on slow boot / cold start

async function checkOnline(): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), PING_TIMEOUT);
    const res = await fetch(PING_URL, {
      method: 'HEAD',
      signal: controller.signal,
      cache: 'no-store',
    });
    clearTimeout(timer);
    return res.ok || res.status === 204;
  } catch {
    return false;
  }
}

/**
 * Returns { isOnline, isOffline }.
 * Starts optimistically as online. Delays the first connectivity check by
 * INITIAL_DELAY ms so a slow app boot / cold start never triggers a false
 * offline flash. Subsequent checks run every PING_INTERVAL ms.
 */
export function useNetworkStatus() {
  const [isOnline, setIsOnline] = useState(true); // optimistic default
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const delayRef    = useRef<ReturnType<typeof setTimeout>  | null>(null);

  useEffect(() => {
    let mounted = true;

    const check = async () => {
      const online = await checkOnline();
      // Only update if we got a definitive offline result — never flip to
      // online from this hook (we already start as online).
      if (mounted) setIsOnline(online);
    };

    // Delay the very first check so the app fully boots before we ping.
    delayRef.current = setTimeout(() => {
      check();
      intervalRef.current = setInterval(check, PING_INTERVAL);
    }, INITIAL_DELAY);

    return () => {
      mounted = false;
      if (delayRef.current)    clearTimeout(delayRef.current);
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  return { isOnline, isOffline: !isOnline };
}
