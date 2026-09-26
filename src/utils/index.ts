import { format, parse, startOfMonth, isThisMonth, isPast, parseISO } from 'date-fns';

export const formatCurrency = (amount: number): string =>
  `₹${amount.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

export const formatDate = (dateStr: string | null): string => {
  if (!dateStr) return '—';
  return format(parseISO(dateStr), 'd MMM yyyy');
};

export const formatMonth = (dateStr: string): string =>
  format(parseISO(dateStr), 'MMMM yyyy');

export const monthToDate = (year: number, month: number): string =>
  `${year}-${String(month).padStart(2, '0')}-01`;

export const currentMonthDate = (): string =>
  format(startOfMonth(new Date()), 'yyyy-MM-dd');

export const isOverdue = (paymentMonth: string): boolean => {
  const d = parseISO(paymentMonth);
  return isPast(d) && !isThisMonth(d);
};

export const openWhatsApp = (phone: string, message: string) => {
  const cleaned = phone.replace(/\D/g, '');
  const intl = cleaned.startsWith('91') ? cleaned : `91${cleaned}`;
  const encoded = encodeURIComponent(message);
  const { Linking } = require('react-native');
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
  const { Platform, Alert } = require('react-native');
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
