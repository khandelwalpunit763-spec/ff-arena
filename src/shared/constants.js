// Domain constants shared by the Player app, the Admin panel and the tests.

export const MATCH_TYPES = {
  solo: { label: 'Solo', teamSize: 1 },
  duo: { label: 'Duo', teamSize: 2 },
  squad: { label: 'Squad', teamSize: 4 },
};

export const MAPS = ['Bermuda', 'Purgatory', 'Kalahari', 'Alpine', 'NeXTerra', 'Bermuda Remastered'];

export const STATUS = {
  UPCOMING: 'upcoming',
  LIVE: 'live',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled',
};

export const ROOM_UNLOCK_MINUTES = 15;          // staff can publish Room ID/Pass 15 min before start
export const MAX_RANK_PRIZES = 10;
export const SLOT_PRESETS = [12, 24, 48, 50];

export const WITHDRAW_METHODS = {
  upi: { label: 'UPI ID', placeholder: 'yourname@okaxis', hint: 'Any UPI ID (GPay, PhonePe, Paytm, BHIM)' },
  paytm: { label: 'Paytm', placeholder: '10-digit Paytm number', hint: 'Paytm wallet / UPI linked number' },
  phonepe: { label: 'PhonePe', placeholder: '10-digit PhonePe number', hint: 'Number registered on PhonePe' },
  gpay: { label: 'Google Pay', placeholder: '10-digit GPay number', hint: 'Number registered on Google Pay' },
};

export const TXN_LABELS = {
  join: 'Match entry fee',
  win: 'Match winnings',
  refund: 'Match refund',
  withdraw: 'Withdrawal request',
  wd_reject: 'Withdrawal reversed',
  deposit: 'Money added',
  adjust: 'Admin adjustment',
};

// Fallback values used until /config/app loads (and by the first-run setup wizard).
export const DEFAULT_APP_CONFIG = {
  appName: 'FF Arena',
  upiId: '',
  upiName: 'FF Arena',
  minDeposit: 10,
  maxDeposit: 10000,
  minWithdraw: 50,
  maxWithdraw: 10000,
  limits: { maxEntryFee: 1000, maxPerKill: 500, maxPrizePool: 100000, maxStaff: 15 },
  features: { upiManual: true, razorpay: false, tournapay: false, phoneOtp: false },
  announcement: '',
  supportContact: '',
  maintenance: false,
};

export function teamSize(type) {
  return MATCH_TYPES[type]?.teamSize || 1;
}

/** Squad/duo slot label → "Team 3 · B" ; solo → "Slot 7" */
export function slotLabel(type, slotNo) {
  const size = teamSize(type);
  if (size === 1) return `Slot ${slotNo}`;
  const team = Math.ceil(slotNo / size);
  const pos = String.fromCharCode(65 + ((slotNo - 1) % size));
  return `Team ${team} · ${pos}`;
}
