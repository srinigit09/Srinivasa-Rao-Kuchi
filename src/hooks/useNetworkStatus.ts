import { useState, useEffect, useRef } from 'react';

const PING_URL = 'https://www.gstatic.com/generate_204'; // Google's lightweight connectivity check
const PING_INTERVAL = 10000; // check every 10 seconds
const PING_TIMEOUT  = 5000;  // consider offline if no response in 5s

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
 * Checks connectivity every 10 seconds by pinging Google's 204 endpoint.
 * Starts optimistically as online — first real check happens immediately.
 */
export function useNetworkStatus() {
  const [isOnline, setIsOnline] = useState(true);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    let mounted = true;

    const check = async () => {
      const online = await checkOnline();
      if (mounted) setIsOnline(online);
    };

    check(); // immediate first check
    intervalRef.current = setInterval(check, PING_INTERVAL);

    return () => {
      mounted = false;
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  return { isOnline, isOffline: !isOnline };
}
