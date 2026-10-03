import { useState, useEffect, useRef } from 'react';
import { SUPABASE_URL } from '../constants';

// Ping the app's own Supabase instance — most reliable indicator for this app
const PING_URL      = `${SUPABASE_URL}/rest/v1/`;
const PING_INTERVAL = 20000;  // check every 20 seconds
const PING_TIMEOUT  = 8000;   // wait up to 8s before declaring offline
const INITIAL_DELAY = 10000;  // wait 10s after app start (prevents boot false-positives)
const FAIL_THRESHOLD = 2;     // require 2 consecutive failures before showing banner

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
    return res.status < 500; // any non-server-error = reachable
  } catch {
    return false;
  }
}

/**
 * Returns { isOnline, isOffline }.
 * Starts optimistically online. Requires FAIL_THRESHOLD consecutive failures
 * before declaring offline — prevents a single flaky ping triggering the banner.
 */
export function useNetworkStatus() {
  const [isOnline, setIsOnline]   = useState(true);
  const failCount                 = useRef(0);
  const intervalRef               = useRef<ReturnType<typeof setInterval> | null>(null);
  const delayRef                  = useRef<ReturnType<typeof setTimeout>  | null>(null);

  useEffect(() => {
    let mounted = true;

    const check = async () => {
      const online = await checkOnline();
      if (!mounted) return;
      if (online) {
        failCount.current = 0;
        setIsOnline(true);
      } else {
        failCount.current += 1;
        if (failCount.current >= FAIL_THRESHOLD) {
          setIsOnline(false);
        }
      }
    };

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
