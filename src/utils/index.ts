import { Linking, Platform, Alert } from 'react-native';

// ── Native date helpers (no date-fns dependency) ─────────────────────────────

/** Parse an ISO date string — same as date-fns parseISO */
const _parse = (dateStr: string): Date => new Date(dateStr);

/** "d MMM yyyy"  e.g. "5 Jan 2025" */
const _formatDate = (d: Date): string =>
  d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

/** "MMMM yyyy"  e.g. "January 2025" */
const _formatMonth = (d: Date): string =>
  d.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });

/** "yyyy-MM-dd"  e.g. "2025-01-05" */
const _formatYMD = (d: Date): string => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

// ── Exported utils ────────────────────────────────────────────────────────────

export const formatCurrency = (amount: number): string =>
  `₹${amount.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

export const formatDate = (dateStr: string | null): string => {
  if (!dateStr) return '—';
  return _formatDate(_parse(dateStr));
};

export const formatMonth = (dateStr: string): string =>
  _formatMonth(_parse(dateStr));

export const monthToDate = (year: number, month: number): string =>
  `${year}-${String(month).padStart(2, '0')}-01`;

export const currentMonthDate = (): string => {
  const now = new Date();
  return _formatYMD(new Date(now.getFullYear(), now.getMonth(), 1));
};

export const isOverdue = (paymentMonth: string): boolean => {
  const d = _parse(paymentMonth);
  const now = new Date();
  const isThisMonth = d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
  const isPast = d < now;
  return isPast && !isThisMonth;
};

export const openWhatsApp = (phone: string, message: string) => {
  const cleaned = phone.replace(/\D/g, '');
  const intl = cleaned.startsWith('91') ? cleaned : `91${cleaned}`;
  const encoded = encodeURIComponent(message);
  Linking.openURL(`https://wa.me/${intl}?text=${encoded}`);
};

export const buildReminderMessage = (params: {
  tenantName: string;
  buildingName: string;
  unitNumber: string;
  month: string;
  amountDue: number;
  upiId?: string;
}): string => {
  const { tenantName, buildingName, unitNumber, month, amountDue, upiId } = params;
  let msg = `Dear ${tenantName},\n\nThis is a reminder that your rent for *${month}* is due.\n\n🏠 Property: ${buildingName} - ${unitNumber}\n💰 Amount: ${formatCurrency(amountDue)}\n\nPlease make the payment at your earliest convenience.`;
  if (upiId) msg += `\n\n📱 UPI ID: ${upiId}`;
  msg += `\n\nThank you!`;
  return msg;
};

export const buildReceiptMessage = (receiptNumber: string, tenantName: string, month: string): string =>
  `Dear ${tenantName},\n\nPlease find attached your rent receipt *${receiptNumber}* for *${month}*.\n\nThank you!`;

export const showAlert = (title: string, message?: string, buttons?: { text: string; onPress?: () => void; style?: 'default' | 'cancel' | 'destructive' }[]) => {
  if (Platform.OS === 'web') {
    const fullMsg = message ? `${title}\n\n${message}` : title;
    if (buttons && buttons.length > 1) {
      const confirmed = window.confirm(fullMsg);
      if (confirmed) {
        const confirmBtn = buttons.find(b => b.style !== 'cancel') || buttons[0];
        confirmBtn?.onPress?.();
      } else {
        const cancelBtn = buttons.find(b => b.style === 'cancel');
        cancelBtn?.onPress?.();
      }
    } else {
      window.alert(fullMsg);
      buttons?.[0]?.onPress?.();
    }
  } else {
    Alert.alert(title, message, buttons as any);
  }
};
