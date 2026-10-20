/* Served at /firebase-config.js by `node scripts/serve.mjs --demo` (Firebase Emulator Suite). */
window.FF_CONFIG = {
  firebase: {
    apiKey: "demo-api-key",
    authDomain: "demo-fftournament.firebaseapp.com",
    projectId: "demo-fftournament",
    storageBucket: "demo-fftournament.appspot.com",
    messagingSenderId: "1234567890",
    appId: "1:1234567890:web:demo"
  },
  functionsRegion: "asia-south1",
  emulator: true,
  demoMode: true,
  brand: { name: "FF Arena", tagline: "Play • Win • Withdraw" },
  demoAccounts: {
    player: [
      { label: "Aman (₹500 deposit · ₹180 winning)", email: "player1@ffarena.gg", password: "Player@123" },
      { label: "Rohit (₹200 deposit)", email: "player2@ffarena.gg", password: "Player@123" },
      { label: "Sneha (₹0 – new user)", email: "player3@ffarena.gg", password: "Player@123" }
    ],
    staff: [
      { label: "Super Admin – Arjun (Owner)", email: "owner@ffarena.gg", password: "Owner@123" },
      { label: "Staff – Rahul", email: "rahul.staff@ffarena.gg", password: "Staff@123" },
      { label: "Staff – Priya", email: "priya.staff@ffarena.gg", password: "Staff@123" }
    ]
  }
};
