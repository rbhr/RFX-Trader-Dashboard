# RFX Trader Dashboard - User Manual

## Table of Contents

1. [Getting Started](#getting-started)
2. [Trader Guide](#trader-guide)
3. [Admin Guide](#admin-guide)

---

## Getting Started

### Logging In

1. Open the dashboard at **https://tradersdash.rftrust.co/** in your browser
2. Enter your **Magic Number** (your unique trader identifier)
3. Enter your **Password**
4. Optionally check **Remember Me** to save your magic number for next time
5. Click **Sign In**

You will be redirected to the Trader Dashboard or the Admin Portal depending on your role.

### Two-Factor Verification

There are two kinds, and the dashboard asks for whichever applies to your account.

**Authenticator app.** If you have set one up (Settings → Security), every sign-in asks for
the 6-digit code from it. This takes precedence over the Telegram code, and it is asked for
every time rather than only on a new device.

**Telegram code.** Otherwise, signing in from a **new device** with Telegram connected sends a
6-digit code to your Telegram. Recognised devices don't ask again.

Admins are **not** exempt from either, and must sign in from the management network — see
[Admin access](#admin-access).

### Forgot Password

Use **Forgot Password** on the login screen: enter your magic number, receive a code via
Telegram, then set a new password. Passwords are stored hashed — support cannot read them back,
only reset them. You can also change your password from Settings, confirmed with your
authenticator code if you have one, or a Telegram code if you don't.

Changing or resetting your password **signs out your other devices**.

### If You Lose Your Authenticator

Each account with an authenticator has **ten recovery codes**, shown once when it was set up.
Enter one in place of the 6-digit code to sign in. Each works only once, and using one is
recorded — so if you did not use it, tell RFX immediately. Setting up a replacement
authenticator **holds payouts for four hours**; signing in with a recovery code does not.

---

## Trader Guide

### Dashboard Overview

After logging in, you see your main dashboard with:

- **Your name and magic number** in the header
- **Notification bell** (shows unread count)
- **Refresh**, **Settings**, and **Logout** buttons

### P&L Summary Cards

Four cards at the top show your profit and loss:

| Card | What it Shows |
|------|---------------|
| This Week | Last 7 days P&L |
| This Month | Current month P&L |
| All Time | Total cumulative P&L |
| Weekly Profit Share | Your share of positive weekly P&L |

### Today's P&L

A large card showing today's total, broken down into:
- **Realized P&L** - from closed trades
- **Floating P&L** - from open positions

### Account & Copier Configuration

Shows your current trading setup:
- Whether trades are being copied to your Live Account
- Scale type (Fixed lot size or Multiplier)
- Maximum open trades and lot size
- Risk limit threshold
- Account Balance and Equity

### Open Positions

Lists all your currently active trades showing:
- Symbol (e.g. EURUSD)
- Direction (BUY / SELL)
- Volume (lot size)
- Open price and current price
- Floating P&L (green = profit, red = loss)

Data refreshes automatically every 30 seconds. Use the refresh button for an immediate update.

### Trade History

Click **View Trade History** from the dashboard (or navigate to `/history`).

Trades are grouped by date. Each day section shows:
- Number of trades that day
- Total P&L for the day

Expand a day to see individual trades with symbol, direction, volume, closing price, and P&L.

### Notifications

Click the **bell icon** to open your notifications panel:
- Unread notifications have a blue dot
- Click a notification to mark it as read
- Use **Mark all as read** to clear all

You receive notifications for:
- Risk limit breach warnings
- Payment confirmations
- Admin broadcast messages

### Settings

Click the **gear icon** to open Settings. There are three tabs:

#### Account Tab

- View your name and magic number
- **Telegram Handle** - enter your Telegram username and click Save
  - After saving, open Telegram and send `/start` to **@RFXTraderBot**
  - A green dot appears when connected
  - Use **Send Test Message** to verify the connection

#### Payments Tab

**USDT Payment Details:**
- Enter your USDT wallet address
- Select network: **TRC20 (Tron)** or **ERC20 (Ethereum)**
- The address is validated for the selected network format
- Click **Save**

Changing an address you have **already saved** is treated as a sensitive change: it needs a
verification code (your authenticator, or Telegram), you are told about it on Telegram and
in-app, and **no payout will be sent to the new address for four hours**. Your first save
during onboarding needs none of that. The wait exists so that if somebody else changes your
address, the money cannot leave before you have seen the message and can say so.

**Payment Summary:**
- Your profit share rate
- Lifetime profit, profit share, and total income

**Payment History:**
- Lists all payments you have received
- Each shows amount, date, and transaction hash
- Click **Show Transmission Proof** to see full payment details including a link to verify on the blockchain (Tronscan or Etherscan)
- **Sent to** shows the address that payment actually went to. Payments made before
  November 2026 show "Not recorded" — the blockchain link is the authority for those

#### Security Tab

**Authenticator App** — optional for traders, required for admins.

1. Click **Set Up Authenticator** and confirm your password
2. Scan the QR code with Google Authenticator, Authy, 1Password or any other authenticator app
   (or type the key in by hand)
3. Enter a code from the app to prove it arrived
4. **Write down the ten recovery codes.** They are shown once and never again

Once set up, every sign-in asks for a code, and so does changing your password or payout
address. **Turn Off Authenticator** needs your password and a current code.

**Change Password** — your current password, the new one twice, then a verification code. Your
other devices are signed out.

### Risk Limit Warnings

If your account equity drops below your risk limit:
1. All trades are automatically closed
2. You receive an in-app notification and a Telegram message (if connected)
3. Contact your admin to review and re-enable trading

### Auto-Refresh Schedule

| Data | Refresh Interval |
|------|-----------------|
| Open Positions | 30 seconds |
| P&L Summary | 60 seconds |
| Account Equity | 60 seconds |
| Copier Config | 5 minutes |

---

## Admin Guide

### Admin access

Since November 2026 the admin account is reachable **only from the RFX tailnet**, at
**https://tda.rfx.capital/** — not at the public `tradersdash.*` addresses, where an admin
sign-in is refused with "Admin access is restricted to the RFX management network." The
hostname resolves to a Tailscale address, so a device that is not on the tailnet cannot reach
it at all.

An admin also needs an **authenticator app**, and a fresh code before any money moves:

- **Signing in** asks for the 6-digit code every time.
- **Sending a payout** asks for one, then covers the next 5 minutes — so a payout run of
  twenty traders asks once, not twenty times. An admin account with no authenticator cannot
  send at all.
- **Removing or replacing** the authenticator holds payouts for four hours.

Admin sessions last **one day** regardless of "Remember Me".

### Security (admin)

Sidebar → **Security**. Three cards:

- **Authenticator App** — set up, or turn off. Enrolment is the same flow traders see
  (password → QR → confirm → ten recovery codes, shown once).
- **Change Password** — needs a current authenticator code. Signs out your other sessions.
- **Payouts** — read-only: whether an authenticator is enrolled, how many recovery codes are
  left, whether the 5-minute payment window is currently open, and any hold from a recent
  authenticator change.

This page exists because the trader Settings dialog is unreachable from `/admin`: the admin
dashboard always shows a trader's dashboard, and the gear icon is hidden while viewing as
somebody else.

### Admin Dashboard

Overview page showing aggregated stats across all traders. Navigate using the sidebar:
- **Dashboard** - overview stats
- **Manage Traders** - trader accounts and configuration
- **Manage MetaCopier** - copier templates and master account assignments
- **Risk Limit Breaches** - breach monitoring and resolution
- **Manage Payments** - payment recording and history

### Manage Traders

The main trader management table with customizable columns.

#### Table Features

- **Column visibility** - click the columns dropdown to show/hide columns
- **Sorting** - click any column header to sort ascending/descending
- **Filter by manager** - filter the table by manager assignment
- Column visibility settings are saved in your browser

#### Available Columns

Name, Magic Number, Manager, Profit Share, MT Account, MT Server, MT Version, MC Location, Copier Config, Lifetime Profit, Lifetime Profit Share, Lifetime Income, Risk Limit, Telegram Status

The Name and Magic columns are sticky (always visible when scrolling horizontally).

#### Adding a Trader

1. Click **Add Trader**
2. Fill in name, magic number, password
3. Set profit share percentage
4. Enter MT4/MT5 credentials (account, server, password, version)
5. Set MetaCopier location
6. Click **Save**

#### Editing a Trader

1. Click the **edit icon** on a trader row
2. Modify any fields: name, password, profit share, MT credentials, Telegram handle, lifetime stats, risk limit
   - The **admin row can be edited** too (since November 2026). Delete and the Active switch
     stay disabled for it — removing or deactivating it would lock everyone out of `/admin`
   - Editing a trader's record here cannot change their payout address; only the account holder
     can, from their own Settings
3. Click **Save**

#### Other Row Actions

- **Toggle Active** - enable or disable a trader
- **Check MC Status** - verify MetaCopier account setup; option to create a new account if none exists
- **View Copiers** - see all copier instances for the trader; toggle copier status between Disabled (D), Manage (M), and Active (A); remove copiers (checks for open positions first)
- **Direct Message** - send a Telegram and/or in-app message to the trader
- **Delete** - permanently remove a trader (with confirmation)

#### Broadcast Messages

Click **Broadcast** in the toolbar to send a message to all traders:
1. Enter your message
2. Choose delivery: Telegram, In-App, or both
3. See the recipient count preview
4. Click **Send**

### Manage MetaCopier

#### Copier Templates

Reusable configurations for setting up new copiers.

**Creating a template:**
1. Click **Create Template**
2. Set name, description, and trading parameters:
   - Scale type (Fixed lot size / Multiplier)
   - Lot size / multiplier values
   - Copy settings (Stop Loss, Take Profit, Skip Pending Orders)
   - Advanced options (max slippage, retry settings, max positions, etc.)
3. Click **Save**

Templates can be edited or deleted at any time.

#### Assign Traders to Master Accounts

Each master (live) account section shows:
- Currently assigned traders (with unassign buttons)
- Available traders to assign (checkbox list)
- Traders already assigned to another master are greyed out

To assign: check the traders and click **Save**.
To unassign: click the X on a trader badge and confirm.

#### Copier Activation & the Onboarding Gate

New traders' live copiers are created **Disabled** and stay that way until the trader completes onboarding. A trader's live copiers activate **automatically** — and the bot sends them their Exness/MT5 login details — once **all** of the following are true:

1. **Telegram linked** — they sent `/start` to @RFXTraderBot
2. **Password changed** — no longer the default (their magic number)
3. **USDT set** — both address and network saved

The check runs whenever the trader links Telegram, changes their password, or saves USDT details — so activation happens the moment the last step is done. It is **one-way**: once a trader has been activated, later edits (e.g. clearing their USDT address) won't disable their copiers or re-send the login message.

Admins can still override copier state at any time via **View Copiers** on the trader row (Disable / Manage / Activate). A copier you manually disable (e.g. for a breach or dispute) stays disabled — the onboarding gate never re-enables an already-activated trader.

### Risk Limit Breaches

Monitors traders whose equity has dropped below their configured risk limit.

**Header shows:**
- Active breach count
- Last checked timestamp (breach monitor runs every 1 minute server-side)

**Active Breaches table:**
- Trader name and magic number
- Equity at breach vs. risk limit
- When the breach occurred
- Whether trader was notified
- **Re-enable Trading** button per row

**Actions:**
- **Re-enable Trading** - opens a confirmation dialog; review the trader's account before proceeding
- **Resolve All** - re-enable all breached traders at once (with confirmation)

**Resolved Breaches** are shown below for historical reference.

### Manage Payments

#### Recording a Payment

1. Select the trader from the dropdown
2. Payment date/time is pre-filled (editable)
3. Enter the **Amount** in USDT
4. Enter the **Network Fee** in USDT
5. Enter the **Transaction Hash**
6. The trader's USDT address and network are displayed (copy button available)
7. Click **Payment Has Been Made**

The trader receives a notification via Telegram and/or in-app.

Recording a payment made elsewhere does not move money, so it asks for no authenticator code —
and its **Sent to** stays "Not recorded", because the app did not choose the destination.

#### Sending from the custodial wallet

A wallet send asks for an authenticator code first (or reuses the open 5-minute window). Two
things will refuse a send outright:

- **The trader's address changed in the last four hours** — "Payouts to it are held until …".
  The payout candidate list shows the same reason before you start a run.
- **Your authenticator was removed or replaced in the last four hours.**

Both are deliberate: on 2 November 2026 somebody with admin access changed a payout address,
sent 2030 USDT and changed it back inside four minutes.

#### Payment History

- Lists all recorded payments with amount, date, and transaction hash
- Click **Show Transmission Proof** for full details with blockchain verification links
- **Sent to** is the address the app actually sent to, recorded at the moment of sending. It
  reads "Not recorded" for payments the app did not send (manually recorded ones) and for rows
  written before November 2026 — the proof deliberately does not substitute the trader's
  current address, which is not necessarily the one that was paid
- **Export CSV** downloads all payment records

### Telegram Integration

The system uses **@RFXTraderBot** for notifications:

- Traders connect by entering their handle in Settings and sending `/start` to the bot
- The bot replies with a welcome message listing the linked account(s) and the dashboard link, **https://tradersdash.rftrust.co/** (the same link is included when re-linking)
- Admins can send direct messages, broadcast messages, and the system sends automatic notifications for breaches and payments
- Green/grey dots in the Telegram column indicate connection status
