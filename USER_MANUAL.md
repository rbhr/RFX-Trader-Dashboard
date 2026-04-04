# RFX Trader Dashboard - User Manual

## Table of Contents

1. [Getting Started](#getting-started)
2. [Trader Guide](#trader-guide)
3. [Admin Guide](#admin-guide)

---

## Getting Started

### Logging In

1. Open the dashboard URL in your browser
2. Enter your **Magic Number** (your unique trader identifier)
3. Enter your **Password**
4. Optionally check **Remember Me** to save your magic number for next time
5. Click **Sign In**

You will be redirected to the Trader Dashboard or the Admin Portal depending on your role.

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

Click the **gear icon** to open Settings. There are two tabs:

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

**Payment Summary:**
- Your profit share rate
- Lifetime profit, profit share, and total income

**Payment History:**
- Lists all payments you have received
- Each shows amount, date, and transaction hash
- Click **Show Transmission Proof** to see full payment details including a link to verify on the blockchain (Tronscan or Etherscan)

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

#### Payment History

- Lists all recorded payments with amount, date, and transaction hash
- Click **Show Transmission Proof** for full details with blockchain verification links
- **Export CSV** downloads all payment records

### Telegram Integration

The system uses **@RFXTraderBot** for notifications:

- Traders connect by entering their handle in Settings and sending `/start` to the bot
- The bot sends a personalised welcome message with their profit share rate and dashboard link
- Admins can send direct messages, broadcast messages, and the system sends automatic notifications for breaches and payments
- Green/grey dots in the Telegram column indicate connection status
