# FF Arena – Architecture

> Paid Free Fire tournament platform: **Player App** + **Multi-Admin Staff Console**, built on
> **Firebase Authentication + Cloud Firestore**, frontend in **HTML5 / CSS3 / vanilla JS (ES modules)**
> bundled to classic scripts so the same `www/` folder runs on the web, in **HopWeb** and in **Cordova**.

---

## 1. System overview

```
 ┌──────────────────────────┐        ┌──────────────────────────────┐
 │  PLAYER APP (index.html) │        │  STAFF CONSOLE (admin.html)  │
 │  Android APK / Web       │        │  Super Admin + 10–15 staff   │
 │  ─ auth, dashboard, join │        │  ─ create/manage matches     │
 │  ─ wallet, withdraw      │        │  ─ room ID, results, payouts │
 └────────────┬─────────────┘        └──────────────┬───────────────┘
              │  Firebase JS SDK v13 (modular)       │  separate app instance
              │  (Auth session "[DEFAULT]")          │  (Auth session "ff-admin")
              ▼                                      ▼
 ┌──────────────────────────────────────────────────────────────────┐
 │                    FIREBASE  (Spark plan is enough)              │
 │  Authentication: Email/Password  ·  Phone OTP (optional)         │
 │  Cloud Firestore + firestore.rules  ← ALL business invariants    │
 │      roles · wallet maths · slot locks · prize formula · caps    │
 │  Hosting (optional): serves www/                                 │
 │  Cloud Functions (optional, Blaze): Razorpay / TournaPay hooks   │
 └──────────────────────────────────────────────────────────────────┘
```

**Key decision: “rules as the backend”.** Every money movement is a client-side Firestore
transaction that Security Rules re-validate line by line. No server is needed for joining,
results, refunds, withdrawals or manual UPI deposits, so the whole platform runs on the free
Spark plan. Only *automatic* gateway deposits (Razorpay/TournaPay) need Cloud Functions, because
payment signatures must be verified with a secret key.

---

## 2. Roles & permissions

| Capability | Player | Staff (Co-Admin) | Super Admin |
|---|:-:|:-:|:-:|
| Browse matches, join, wallet, withdraw request | ✅ | ✅ | ✅ |
| Create match (auto-tagged `hostId` + `hostName`) | ❌ | ✅ | ✅ |
| Edit / go-live / cancel / room ID / results – **own matches** | ❌ | ✅ | ✅ |
| …on **other staff's** matches | ❌ | ❌ | ✅ |
| Verify manual UPI deposits | ❌ | only with `perms.deposits` | ✅ |
| Approve / reject withdrawals | ❌ | ❌ | ✅ |
| Revenue dashboard, staff performance | ❌ | own stats | ✅ |
| Manage staff, roles, permissions | ❌ | ❌ | ✅ |
| App settings (UPI ID, limits, feature flags) | ❌ | ❌ | ✅ |
| Arbitrary wallet adjustment, ban players | ❌ | ban only | ✅ |

Roles live in `/staff/{uid}` (`role: 'super' | 'staff'`, `active`, `perms`). Deactivating
(`active: false`) instantly removes every privilege because the rules check it on each request.

---

## 3. Firestore data model

```
config/app                         public settings (UPI id, min/max, limits, feature flags, announcement)
staff/{uid}                        { uid, name, email, role, active, perms:{deposits}, createdAt, createdBy }
users/{uid}                        { uid, name, email, phone, ign, ffUid, phoneVerified, banned, createdAt }
wallets/{uid}                      { deposit, winning, updatedAt, lastRef:{type,id} }
  └─ txns/{type}_{refId}           ledger: { type, amount(±), refId, note, createdAt }
matches/{matchId}                  { title, type, map, startAt, entryFee, perKill, prizePool, rankPrizes{"1":200,…},
                                     totalSlots, description, hostId (admin_id), hostName (staff_name), status,
                                     joinedCount, collected, rankPaid, killsPaid, distributed, resultsCount,
                                     refunded, refundedCount, roomPublishedAt, lastResult, lastRefund, … }
  ├─ slots/{slotNo}                CREATE-ONLY lock  { slotNo, uid, ign, ffUid, joinedAt }
  ├─ players/{uid}                 CREATE-ONLY entry { uid, slotNo, ign, ffUid, fromDeposit, fromWinning, joinedAt }
  ├─ private/room                  { roomId, roomPass, by, updatedAt }   ← readable by joined players + staff only
  ├─ results/{uid}                 CREATE-ONLY payout { kills, rank, killAmount, rankAmount, amount, by }
  └─ refunds/{uid}                 CREATE-ONLY refund { amount, by }
withdrawals/{id}                   { uid, amount, method, account, holder, status: pending|paid|rejected, txnRef, reason }
deposits/{UTR | rzp_<paymentId>}   { uid, amount, utr, method, status: pending|approved|rejected }
paymentOrders/{orderId}            gateway orders (Cloud Functions only)
```

Match status lifecycle: `upcoming → live → completed`, or `upcoming|live → cancelled` (refunds).

---

## 4. Money invariants enforced by `firestore.rules`

| # | Invariant | How |
|---|---|---|
| 1 | Nobody can mint money | A wallet update must carry `lastRef {type,id}`; the rules recompute the exact delta from that reason document and reject anything else. Players can only **decrease** their own balance. |
| 2 | Entry fee is exact | `fromDeposit + fromWinning == match.entryFee` and the wallet must drop by exactly those amounts in the **same** transaction. |
| 3 | One seat per slot | `slots/{n}` is create-only, so a second create fails, even at the same millisecond. |
| 4 | One entry per player | `players/{uid}` is create-only. |
| 5 | Joining closes on time | `request.time < startAt`, `status == 'upcoming'`, `joinedCount <= totalSlots`. |
| 6 | Prize formula is server-side | `amount == kills × perKill + rankPrizes[rank]`. |
| 7 | Every payout happens once | `results/{uid}` and `refunds/{uid}` are create-only; wallet credits must pair with them. |
| 8 | Hard payout caps | `Σ rankAmount ≤ prizePool`, `Σ kills ≤ joinedCount`, plus Super-Admin limits on fee, per-kill and pool size. |
| 9 | Only winnings are withdrawable | A withdrawal can only reduce `winning`; the amount is held immediately (no double-spend). |
| 10 | A UTR can be claimed once | The deposit doc id **is** the UTR (create-only). |
| 11 | Refund goes back to its source | Deposit and winning parts are restored separately, so cancelled matches can't turn deposit money into withdrawable money. |
| 12 | The ledger can't be faked | `txns/{type}_{refId}` must equal the wallet delta of the same batch. |
| 13 | Room ID unlocks 15 min before start | `request.time >= startAt − 15m` for writes; reads require a `players/{uid}` doc. |
| 14 | Staff isolation | Match create needs `hostId == auth.uid` and `hostName == staff.name`. Edits need `hostId == auth.uid` or Super Admin. |

---

## 5. Concurrency – the join transaction

```
Player A ─┐                                    ┌─ commit ✔  (slot 13 created)
          ├─ runTransaction:                   │
Player B ─┘   read match, slot13, players/me,  └─ commit ✘  slot already exists
              wallet → write slot13 (create),      → our code re-reads → "Slot #13 was just booked"
              players/me, match +1 (increment),
              wallet −fee (increment), ledger
```

* Counters and balances use `increment()`, so a write stays valid against the **latest** server
  state. When two players join *different* slots at the same moment, the loser gets a retryable
  precondition failure and the SDK retries automatically (up to 12 attempts).
* Two players on the **same** slot: the create-only lock makes the second commit fail. The
  service maps that to `SLOT_TAKEN`, and the slot grid (real-time listener) greys the seat out.
* Tested: 10 simultaneous clicks on one slot → exactly 1 booking and 1 charge. 15 simultaneous
  joins on different slots → all succeed with exact counters (`tests/rules.test.mjs`).
* Gotcha found by the tests: `increment(-0)` serialises as a *double* and fails the `is int`
  money checks, so zero-delta fields are simply omitted.

---

## 6. Other flows

**Result upload.** For each player, one transaction creates `results/{uid}`, bumps the match
counters (`rankPaid`, `killsPaid`, `distributed`, `resultsCount`, `lastResult`), adds
`wallet.winning += amount` and writes the `win_{matchId}` ledger entry. It's idempotent, so
re-running after a network drop only processes players who weren't credited yet. The staff UI
pre-validates with the same formula (`src/shared/prize.js`). Duplicate ranks beyond the team
size are blocked and the pool cap is checked.

**Cancel & refund.** Status → `cancelled` (only if nothing was distributed). Then each player gets
a `refunds/{uid}` + wallet restore + ledger entry. It can be resumed.

**Manual UPI deposit.** The player pays via the UPI intent / QR, then submits the UTR, which
creates `deposits/{UTR}` (pending). The Super Admin (or staff with permission) approves:
deposit → approved, wallet.deposit += amount, ledger.

**Gateway deposit (optional).** `createRazorpayOrder`, then Checkout, then `verifyRazorpayPayment`
(HMAC). The `razorpayWebhook` is a backup. Both use `creditDeposit()` with deposit id
`rzp_<paymentId>`, so a payment is credited only once.

**Withdrawal.** The player requests it, and the amount is held from `winning`. The Super Admin
either marks it **paid** (with the payout reference) or **rejects** it, which atomically
returns the amount to `winning`.

**Password recovery.** Email reset link (Firebase), or Mobile OTP: link a verified number in
Profile → later `signInWithPhoneNumber` signs into the same account → `updatePassword`.

---

## 7. Frontend architecture

* **No framework.** Tiny modules: `dom.js` (auto-escaping `html` tagged template, which is
  XSS-safe for user IGNs), `router.js` (hash router that works on `file://`), `store.js`
  (observable state), `ui.js` (toasts, sheets, dialogs, countdown ticker).
* **Services layer** (`src/services/*`) holds all Firebase logic. Screens never touch Firestore
  directly. Services accept an injectable context, so the same code runs in Node tests.
* **Screens** are functions `(el, params) => cleanup`. Real-time listeners are disposed on
  navigation.
* **Build**: esbuild → IIFE bundles (`www/js/player.js`, `www/js/admin.js`) + CSS with local
  fonts. Runtime config stays in `www/firebase-config.js`, so there's no rebuild to change keys.
* The **Admin console uses a separate Firebase app name**, so a staff session never overwrites a
  player session on the same device.

---

## 8. Scaling notes

* A match document takes one write per join. Firestore sustains about 1 write/s per document
  (bursts are OK) and transactions retry, which is fine for 48–100 slot lobbies. For very large
  lobbies, use distributed counters.
* The Super Admin revenue view uses **server-side aggregation** (`sum()`/`count()`). It doesn't
  read every match document.
* Lists are paginated with `limit()`. Indexes are in `firestore.indexes.json`.
* Rules use at most about 12 document lookups per transaction (the limit is 20).
