// Domain errors + human-friendly messages for Firebase error codes.

export class AppError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'AppError';
    this.code = code;
  }
}

const MESSAGES = {
  // Auth
  'auth/invalid-email': 'Please enter a valid email address.',
  'auth/missing-password': 'Please enter your password.',
  'auth/invalid-credential': 'Wrong email or password.',
  'auth/wrong-password': 'Wrong email or password.',
  'auth/user-not-found': 'No account found with this email.',
  'auth/user-disabled': 'This account has been disabled. Contact support.',
  'auth/email-already-in-use': 'An account with this email already exists. Try logging in.',
  'auth/weak-password': 'Password must be at least 6 characters.',
  'auth/too-many-requests': 'Too many attempts. Please wait a minute and try again.',
  'auth/network-request-failed': 'Network error. Check your internet connection.',
  'auth/invalid-phone-number': 'Enter a valid 10-digit mobile number.',
  'auth/missing-phone-number': 'Enter your mobile number.',
  'auth/invalid-verification-code': 'Incorrect OTP. Please check and try again.',
  'auth/code-expired': 'OTP expired. Please request a new one.',
  'auth/credential-already-in-use': 'This mobile number is already linked to another account.',
  'auth/provider-already-linked': 'A mobile number is already linked to this account.',
  'auth/requires-recent-login': 'For security, please log in again and retry.',
  'auth/captcha-check-failed': 'reCAPTCHA failed. Please retry.',
  'auth/operation-not-allowed': 'This sign-in method is not enabled in Firebase Console.',
  'auth/quota-exceeded': 'SMS quota exceeded. Try email reset instead.',
  // Firestore
  'permission-denied': 'Action not allowed. (Blocked by security rules)',
  unavailable: 'Server unreachable. Check your connection and retry.',
  aborted: 'Too many players are joining right now. Please try again.',
  'failed-precondition': 'Data changed while you were acting. Please retry.',
  'resource-exhausted': 'Server is busy. Please retry in a moment.',
  'not-found': 'Not found.',
  'deadline-exceeded': 'Request timed out. Please retry.',
};

export function friendlyError(err) {
  if (!err) return 'Something went wrong.';
  if (err instanceof AppError || err?.name === 'AppError') return err.message;
  const code = String(err.code || '').replace(/^firestore\//, '');
  if (MESSAGES[code]) return MESSAGES[code];
  if (MESSAGES[err.code]) return MESSAGES[err.code];
  return err.message || 'Something went wrong.';
}
