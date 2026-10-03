import { useAuth } from '../context/AuthContext';

export interface SubscriptionInfo {
  /** null = unlimited */
  daysLeft: number | null;
  isExpired: boolean;
  isWarning: boolean;
  plan: string;
}

export function useSubscription(): SubscriptionInfo {
  const { profile } = useAuth();

  const plan = (profile as any)?.subscription_plan ?? 'unlimited';
  const expiresAt: string | null = (profile as any)?.subscription_expires_at ?? null;

  // Unlimited plan or no expiry → no restriction
  if (plan === 'unlimited' || !expiresAt) {
    return { daysLeft: null, isExpired: false, isWarning: false, plan };
  }

  const msLeft = new Date(expiresAt).getTime() - Date.now();
  const daysLeft = Math.ceil(msLeft / (1000 * 60 * 60 * 24));

  const isExpired = daysLeft <= 0;
  const isWarning = !isExpired && daysLeft <= 7;

  return { daysLeft: Math.max(0, daysLeft), isExpired, isWarning, plan };
}
