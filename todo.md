# RFX Trader Dashboard - TODO

---

## 🎉 RELEASE MILESTONE - v1.0 (Checkpoint: aba08dbd)
**Date:** February 15, 2026
**Status:** ✅ Stable - All Core Features Working

### Core Features Completed:
- ✅ MetaCopier account creation with automatic magic number retrieval
- ✅ Account naming convention (RFX - Name - Magic)
- ✅ Automatic risk limits ($300 absolute, 1 second fulfillment, close all positions)
- ✅ Automatic features (Data collector, HFT mode, Socket, Trade guardrails)
- ✅ Duplicate account prevention
- ✅ Check MC status with deleted account detection
- ✅ Trader management (CRUD operations)
- ✅ Copier management (Disable, Manage, Activate, Remove)
- ✅ Live account number assignment
- ✅ Profit tracking and calculations
- ✅ Trading dashboard with P&L metrics
- ✅ Position tracking (open and historical)

---

## Backend Features
- [x] Setup database schema for magic number configuration
- [x] Create MetaCopier.io API proxy service with secure key handling
- [x] Implement magic number authentication endpoints
- [x] Build position data filtering by magic number
- [x] Add session management with JWT tokens
- [x] Create endpoints for open positions
- [x] Create endpoints for historical positions (today, week, month, all-time)
- [x] Create endpoint for account information
- [x] Implement P&L calculation logic (profit + swap + commission)
- [x] Add profit share calculation (35% of positive weekly P&L)

## Frontend Features
- [x] Design clean, functional UI theme with trading-focused color scheme
- [x] Build login page with magic number selection dropdown
- [x] Implement password validation and authentication flow
- [x] Add "Remember Me" functionality with localStorage
- [x] Create dashboard layout with navigation
- [x] Build P&L summary cards (today, week, month, all-time)
- [x] Display realized vs floating P&L breakdown
- [x] Show weekly profit share calculation
- [x] Create open positions list with color-coded profit indicators
- [x] Build trade history view with date grouping
- [x] Implement expandable daily sections for trade details
- [x] Add auto-refresh intervals (30s for positions, 60s for history)
- [x] Implement manual pull-to-refresh functionality
- [x] Add logout functionality
- [x] Ensure responsive design for desktop, tablet, and mobile
- [x] Add loading states and error handling
- [x] Implement empty states for no data scenarios

## Testing & Deployment
- [x] Write backend tests for API proxy and calculations
- [x] Test authentication flow
- [x] Test data refresh and real-time updates
- [x] Verify responsive design across devices
- [x] Create production checkpoint (v1.0 - aba08dbd)

## Admin User & Management Features
- [x] Create admin user (username: admin, password: admin)
- [x] Add role field to trading sessions
- [x] Create admin sidebar navigation component
- [x] Add Trader Dashboard page (admin view)
- [x] Add Manage Traders page
- [x] Add Manage MetaCopier page
- [x] Add Manage Payments page
- [x] Implement role-based routing and access control
- [x] Add admin logout functionality

## Manage Traders Feature
- [x] Update magic_numbers schema with MT account fields (mtAccount, mtServer, mtPassword, mtVersion)
- [x] Add profit tracking fields (lifetimeProfit, lifetimeProfitShare, lifetimeIncome)
- [x] Add active/inactive status field
- [x] Add MetaCopier API method to check if account exists
- [x] Add MetaCopier API method to create new account
- [x] Create tRPC procedures for listing all traders
- [x] Create tRPC procedures for updating trader details
- [x] Create tRPC procedures for deleting traders
- [x] Create tRPC procedures for checking MetaCopier status
- [x] Create tRPC procedures for creating MetaCopier account
- [x] Build Manage Traders data table with all fields
- [x] Implement inline editing for profit share
- [x] Implement activate/deactivate toggle
- [x] Add edit trader dialog
- [x] Add delete confirmation dialog
- [x] Add "Check MetaCopier Status" button
- [x] Implement MetaCopier status check dialog
- [x] Implement MetaCopier account creation dialog
- [x] Calculate and display lifetime metrics
- [x] Test all CRUD operations
- [x] Test MetaCopier integration

## MC Account Creation Enhancement
- [x] Create copier on slave account (b94cabc8-946d-4a99-9b81-286f8553cc63) when MC account is created
- [x] Retrieve real magic number from copier's fromAccountShortId
- [x] Update database with new magic number and set password to match
- [x] Rename MC account to "RFX - <name> - <magic>"
- [x] Add "RFX Trader" label to MC account
- [x] Add features to MC account creation: Data collector, HFT mode, Socket, Trade guardrails
- [x] Add risk limit to MC account creation: Actual, Absolute $300, fulfil in 1 second, close all open trades
- [x] Auto-delete copier after retrieving magic number

## Store MC Account ID
- [x] Add mcAccountId field to traders table schema
- [x] Update account creation to save MC account ID to database
- [x] Update check MC status to use stored account ID instead of searching

## Risk Limit and MC Check Updates
- [x] Change risk limit fulfillSeconds from 60 to 1 second
- [x] Update Check MC logic to query MetaCopier API directly instead of database only (already implemented)
- [x] Test that Check MC works even if account is deleted in MetaCopier (logic verified)

## Check MC Bug Fix
- [x] Fix checkMetaCopierStatus to check account status field (Deleted accounts still return from API)
- [x] Clear mcAccountId from database when account status is Deleted
- [x] Test with deleted account (verified working)

## Copier Management Feature
- [x] Remove "Remove MC Configuration" button from Check MC dialog (not needed - Check MC is for status only)
- [x] Add backend API method to fetch all copiers for a trader (where trader is source)
- [x] Add backend API method to disable copier
- [x] Add backend API method to set copier to "Manage" mode (no new trades)
- [x] Add backend API method to activate copier
- [x] Add backend API method to remove copier (check for open positions first)
- [x] Add "Copiers" button to trader list
- [x] Build Copiers dialog showing all copiers with status
- [x] Add D/M/A/X action buttons for each copier
- [x] Test copier management actions

## Live Account Number Feature
- [x] Add liveAccountNumber field to traders table schema
- [x] Create endpoint to fetch accounts with "RFX Master" label
- [x] Add Live Account Number dropdown to Edit Trader dialog
- [x] Update backend to save Live Account Number when editing trader

---

## 📋 Future Features & Improvements

### Optimized Polling System
- [ ] Implement optimistic UI updates for instant feedback
- [ ] Add efficient polling with smart refresh intervals
- [ ] Implement background data prefetching
- [ ] Add loading states with skeleton screens

### Payment Management
- [ ] Build payment tracking system
- [ ] Add payment history view
- [ ] Implement profit share payout tracking
- [ ] Add payment status indicators

### Analytics & Reporting
- [ ] Create detailed performance reports
- [ ] Add trader comparison views
- [ ] Implement export functionality (CSV, PDF)
- [ ] Add custom date range filtering

### Notifications
- [ ] Add real-time notifications for important events
- [ ] Implement email notifications for payments
- [ ] Add alerts for risk limit hits
- [ ] Create notification preferences

---

## 🐛 Known Issues
None - All critical bugs resolved in v1.0

---

## 📝 Notes
- MetaCopier API returns deleted accounts with status.name = "Deleted" instead of throwing errors
- Risk limits require both `riskLimit` (relative, set to 0.0) and `absoluteRiskLimit` ($300) fields
- Minimum fulfillSeconds allowed by MetaCopier API may be higher than 1 second (needs verification)

## Dev Server Authentication Fix
- [ ] Create easy admin login for dev environment
- [ ] Test admin page access on dev server
- [ ] Document dev server login credentials

## Feature Settings Update
- [x] Update Trade Guardrails maxLotSizeThreshold to 0.1
- [x] Add Max Open Positions feature (set to 3)
- [x] Fix database update to save real magic number after MC account creation (was just UI refresh issue)
- [x] Add automatic trader list refresh after MC account creation

## Bulk Copier Creation for Live Account
- [x] Examine Ahmed's copier format (e04699f5-8ddc-4902-9797-4c8482e8bf18) on MC account c3d6a0ef-3a3a-4f5c-9300-4b253164bc94
- [x] Query database for all traders with liveAccountNumber = 251974020
- [x] Create copiers for each trader using custom magic field
- [x] Verify all copiers created successfully (19 copiers confirmed)

## Update Copier Fixed Lot Size
- [x] Get Ahmed's updated copier configuration
- [x] Create script to update all copiers to fixed lot size 0.01
- [x] Run script and verify all 19 copiers updated (scaleType: 3, fixedLotSize: 0.01)

## Bulk Copier Creation for All RFX Master Accounts
- [x] Fetch all MC accounts with "RFX Master" label (found 7 accounts)
- [x] Create script to generate copiers for all 19 traders on each RFX Master account
- [x] Run script and verify all copiers created with fixed lot size 0.01 (114 new copiers created across 6 accounts)

## Copier Templates Feature
- [x] Create copier_templates database table
- [x] Add backend API for template CRUD operations (list, getById, create, update, delete)
- [x] Build Copier Templates UI in Manage MetaCopier page
- [x] Add edit template dialog with all copier settings
- [x] Seed two initial templates (Fixed Lot 0.01, No Scaling 0.01)
- [x] Test template creation, editing, and deletion

## Update Data Collector Interval
- [x] Fetch all MC accounts (48 total)
- [x] Create script to update Data Collector interval from 60s to 30s
- [x] Run script and verify all accounts updated (0 accounts have Data Collector feature enabled)

## Trader Dashboard Live Account Integration
- [x] Update backend to fetch positions from trader's live account (using liveAccountNumber field)
- [x] Modify P&L calculations to filter by magic number on live account
- [x] Update open trades display to show trades from live account
- [x] Update trade history to show history from live account
- [x] Test trader dashboard with live account data (tested with Saif: Month $8,270.72, All-time $10,275.82)

## Update Meta Tags for Link Previews
- [x] Add meta description tag
- [x] Add Open Graph tags for social media previews
- [x] Add Twitter Card tags

## Add Manager Field to Traders
- [x] Add manager field to magic_numbers table schema (varchar 100, default 'RFX')
- [x] Push database schema changes (migration 0008_pale_next_avengers.sql)
- [x] Update all existing traders to set manager = 'RFX' (default value applied automatically)

## Add 7 HubbFX Traders
- [x] Generate random magic numbers for all 7 traders (39717, 15601, 86788, 16318, 36885, 82586, 21067)
- [x] Insert traders into database with manager='HubbFX' and MT5 account details (Amber, Shadost, Azra, Khan, Khalid, Meer, Maria)

## Add Manager Column to Manage Traders
- [x] Add Manager column to traders table display
- [x] Add manager filter dropdown (All, RFX, HubbFX)
- [x] Update backend to include manager field in listTraders response

## Add Sortable Columns to Manage Traders Table
- [x] Implement sorting state and logic for table columns
- [x] Add sort indicators (arrows) to column headers (ArrowUp, ArrowDown, ArrowUpDown)
- [x] Make columns sortable: Name, Magic, Manager, Profit Share, MT Account, MT Server, MT Version, MC Location, Lifetime Profit, Lifetime Share, Lifetime Income, Status

## Display Copier Multiplier on Trader Dashboard
- [x] Create backend API to fetch copier configuration for trader's live account
- [x] Determine copier scale type (multiplier vs fixed lot size)
- [x] Add display after "Open Positions" showing how trades are copied
- [x] Add copier active status to backend response
- [x] Display warning if copier is disabled (red text)
- [x] Test with trader who has active copier (Omair - shows "0.01 lots" message)
- [x] Verified isActive field returns correctly from API

## Fix Copier Display Wording
- [x] Check Zeeshan's copier configuration (magic 22973, scaleType 4)
- [x] Fix display logic to show correct message for all scale types (added scaleType 4 to fixed lot display)
- [x] Ensure fixed lot size displays correctly (now shows "0.01 lots" for both scaleType 3 and 4)

## Fix Copier Multiplier Display
- [x] Change logic to check multiplier value instead of scaleType
- [x] Show multiplier message when multiplier > 1
- [x] Show fixed lot message when multiplier = 1
- [x] Test with Zeeshan (multiplier 5x) - correctly shows "multiplied by 5x"

## Add Copy Rate Column to Manage Traders
- [x] Create backend API to fetch copier info for all traders at once (added to listTraders)
- [x] Add Copy Rate column showing "nX" for multiplier, "n.nn" for fixed lots, "0" for disabled
- [x] Make Copy Rate column sortable

## Fix Copy Rate Display for Tarique and Sameer
- [x] Check Tarique and Sameer's copier configurations (Tarique: 0.5x, Sameer: 1x, scaleType: 4)
- [x] Fix display logic to check scaleType first (scaleType 3 = fixed lots, others = multiplier)
- [x] Updated backend to include scaleType in copier info
- [x] Fixed frontend display logic in ManageTraders and Dashboard

## Add Max Open Trades Display to Trader Dashboard
- [x] Fetch trader's MetaCopier account features to get max open trades setting (type 17)
- [x] Add backend API to return max open trades (getMaxOpenTrades procedure)
- [x] Display "Your maximum open trades: {max}" on trader dashboard after copier info
- [x] Show 'unavailable' when API returns null (due to MetaCopier API connection issues)

## Fix Max Open Trades Backend Parsing
- [x] Debug getMaxOpenTrades to see actual API response structure (getAccountById doesn't return features)
- [x] Add getAccountFeatures method to fetch features from /accounts/{id}/features endpoint
- [x] Update getMaxOpenTrades to use getAccountFeatures instead of getAccountById
- [x] Test with Omair to verify display shows "3" (working correctly)

## Add Settings Button to Trader Dashboard
- [x] Add Settings button near refresh button on trader dashboard
- [x] Implement settings dialog/page for trader preferences
- [x] Create Payments section in settings

## Payment System Implementation
- [x] Add USDT Address and USDT Network fields to magic_numbers table
- [x] Create payments table with transaction hash, date, amount, trader reference
- [x] Add USDT address input fields to trader Settings > Payments section
- [x] Build Make Payments section in admin Manage Payments page
- [x] Implement payment notification system for traders
- [x] Display payment history in trader Settings > Payments section
- [x] Add notification bell with badge to trader dashboard header
- [x] Test complete payment flow from admin to trader notification

## Payment System Enhancements
- [x] Add Network Fee field to payments table
- [x] Change payment date to datetime field in admin form
- [x] Add "Show Transmission Proof" button to payment history
- [x] Create transmission proof dialog with professional design
- [x] Display payment details: amount, address, network, fee, transaction hash, submitted time

## Transmission Proof UI Enhancements
- [x] Upload TRC20 (red) and ERC20 (green) USDT logos to project
- [x] Replace generic icon with network-specific logos in transmission proof header
- [x] Add network name (TRC20/ERC20) centered below logo
- [x] Add blockchain explorer links (TronScan for TRC20, Etherscan for ERC20)
- [x] Add external link icon next to copy icon for transaction hash
- [x] Display timezone in all datetime fields

## Bug Fix
- [x] Fix missing "Show Transmission Proof" button in payment history
- [x] Fix Settings dialog to fit tablet screens with scrollbars

## Production Release v1.4
- [x] Add app version and build hash display above logout button
- [x] Create production release checkpoint as v1.4

## Version 1.4.1 Updates
- [x] Remove version display from trader dashboard header
- [x] Add version display to admin sidebar bottom (near logout)
- [x] Add version display to trader page footer (centered, small text)
- [x] Add padding below admin logout button
- [x] Update version to 1.4.1
- [x] Create v1.4.1 checkpoint

## Payment System Improvements
- [x] Sort payment history newest first in trader settings (already implemented)
- [x] Set default payment time to current time in admin's timezone (already implemented)
- [x] Make admin payment history entries clickable to show transmission proof
- [x] Remove test payment for Saif

## Payment Fixes
- [x] Remove all payments for test999 trader
- [x] Fix admin payment datetime to properly default to current time

## Fix TEST999 Payment Deletion
- [x] Find correct trader record for TEST999
- [x] Delete all associated payments (3 payments removed)

## Fix Payment Datetime Timezone
- [x] Update admin payment datetime to use local timezone instead of UTC
- [x] Test datetime displays correctly in admin's local time

## Version 1.4.2 Release
- [x] Update version number to 1.4.2
- [x] Create production checkpoint

## Fix Version Display
- [x] Update hardcoded version in Dashboard component to 1.4.2
- [x] Update hardcoded version in AdminLayout component to 1.4.2

## Update Lifetime Payout on Payment
- [x] Add lifetime payout increment to makePayment procedure
- [x] Update lifetimeIncome field when payment is made
- [x] Test payment updates lifetime totals correctly

## Future: Lifetime Profit Share Calculation
- [ ] Implement automatic lifetime profit share calculation based on trading performance
- [ ] Add profit share rate configuration per trader
- [ ] Calculate and update lifetimeProfitShare field automatically

## Admin Payment Form - USDT Address Display
- [ ] Add read-only USDT address field to admin payment form
- [ ] Add copy to clipboard button for USDT address
- [ ] Update USDT address field when trader selection changes
- [ ] Show network type (TRC20/ERC20) alongside address

## Admin Payment Form - USDT Address Display
- [x] Add read-only USDT address field above submit button
- [x] Add copy to clipboard button for USDT address
- [x] Update USDT address field when trader selection changes
- [x] Show network type (TRC20/ERC20) alongside address

## Version 1.4.4 Release
- [x] Update version number in package.json to 1.4.4
- [x] Update version display in AdminLayout to 1.4.4
- [x] Update version display in Dashboard to 1.4.4
- [x] Create production release checkpoint


## Version 1.5 Release (Planned)

### Payment Confirmation Modal
- [x] Create confirmation dialog component for payment submission
- [x] Display payment summary before recording (trader name, amount, network, transaction hash)
- [x] Add "Confirm" and "Cancel" buttons
- [x] Show confirmation modal when admin clicks "Record Payment"
- [x] Only submit payment after explicit confirmation

### USDT Address Validation
- [x] Implement TRC20 address validation (34 characters, starts with 'T')
- [x] Implement ERC20 address validation (42 characters, starts with '0x')
- [x] Add real-time validation feedback in trader settings USDT address field
- [x] Show error message for invalid address format
- [x] Prevent saving invalid USDT addresses
- [ ] Add validation tests for both network types

### Payment Export to CSV
- [x] Add "Export to CSV" button in admin payment history section
- [x] Generate CSV with columns: Date, Trader, Amount, Network, Network Fee, Transaction Hash
- [x] Format dates in readable format (YYYY-MM-DD HH:mm)
- [x] Include all payment records or allow date range filtering
- [x] Trigger browser download of generated CSV file
- [x] Add filename with current date (e.g., "payments_export_2026-02-24.csv")


## Telegram Handle Field
- [x] Add telegramHandle field to magic_numbers table schema
- [x] Push database schema changes
- [x] Update backend listTraders to include telegramHandle
- [x] Update backend updateTrader to accept telegramHandle
- [x] Add Telegram Handle input field to Edit Trader dialog
- [x] Test editing and saving Telegram Handle
- [x] Create checkpoint

### Telegram Handle Display in Traders Table
- [x] Add "Telegram" column to Manage Traders table
- [x] Display telegram handle in table (show handle or "Not set")
- [x] Make Telegram column sortable
- [ ] Add filter option to show only traders with/without Telegram handles

### Telegram Handle in Trader Settings
- [x] Add Telegram Handle field to trader Settings dialog
- [x] Display as read-only field in Settings > Account Information section
- [x] Show "Not set" message if trader has no Telegram handle
- [x] Add informational text explaining Telegram is used for notifications

### Telegram Bot Integration
- [x] Research and select Telegram Bot API library for Node.js (node-telegram-bot-api)
- [x] Create Telegram bot (@RFXTraderBot) and obtain bot token
- [x] Add bot token to environment variables via webdev_request_secrets
- [x] Implement sendTelegramMessage function in backend (server/telegram.ts)
- [x] Update payment notification system to send via Telegram
- [x] Add fallback to in-app notification if Telegram send fails
- [x] Test Telegram bot connection (6/6 tests passing)
- [ ] Test Telegram notifications with real trader accounts
- [ ] Add notification preference setting (Telegram, In-app, Both)

### Assign Traders to Master Accounts (Manage MetaCopier)
- [x] Read existing MetaCopier and trader data structures
- [x] Add backend procedure to fetch MC accounts with label "RFX Master"
- [x] Add backend procedure to assign traders to a master (set liveAccountNumber)
- [x] Build UI section in Manage MetaCopier with master account list
- [x] Multi-select grid for each master showing all traders
- [x] Grey out / disable traders already assigned to a different master
- [x] Save button sets liveAccountNumber for selected traders
- [x] Tests passing (4/4)
- [x] Checkpoint saved

### Unassign Trader from Master Account
- [x] Add unassignTraderFromMaster backend procedure (sets liveAccountNumber to null)
- [x] Add ✕ button to Currently Assigned badges in Manage MetaCopier
- [x] Show confirmation before unassigning
- [x] Refresh assignment list after unassign
- [x] Tests passing (3/3)
- [x] Checkpoint saved

### Risk Limit Warning in Open Positions Section
- [x] Locate Open Positions section in trader Dashboard
- [x] Check how absolute risk limit value is available in trader session/MC data
- [x] Add getAccountRiskLimits method to MetaCopierService (live API fetch, not hardcoded)
- [x] Add getRiskLimit tRPC procedure to trading router
- [x] Add warning line: "If the equity in your incubator account drops below ${riskLimit}, all trades will be closed..."
- [x] Risk limit value shown in red for emphasis
- [x] Tests passing (4/4)
- [x] Checkpoint saved

### Risk Limit Column in Manage Traders Table
- [x] Add TraderRiskLimitCell component (lazy per-row fetch from MetaCopier API)
- [x] Add Risk Limit column to Manage Traders table showing $amount or loading indicator
- [x] Column visible in admin Manage Traders view

### Edit Risk Limit from Admin Manage Traders
- [x] Add updateAccountRiskLimit and createAccountRiskLimit methods to MetaCopierService
- [x] Add getTraderRiskLimit and updateTraderRiskLimit tRPC admin procedures
- [x] Add RiskLimitField component to Edit Trader dialog (numeric input, $ prefix)
- [x] Save updates the MetaCopier risk limit via API

### Risk Limit Breach Notifications (In-app + Telegram)
- [x] Add riskLimitBreaches table to schema and push migration
- [x] Add createRiskLimitBreach, getActiveBreachByMagicNumberId, resolveRiskLimitBreach, getAllRiskLimitBreaches DB helpers
- [x] Add getAccountEquity tRPC procedure (polls MetaCopier every 60s from trader dashboard)
- [x] Add reportRiskLimitBreach tRPC procedure (deduplicates, sends in-app + Telegram to trader and admin)
- [x] Add resolveRiskLimitBreach and getRiskLimitBreaches admin procedures
- [x] Breach detection useEffect in trader Dashboard fires once when equity < riskLimit
- [x] Show toast error to trader when breach detected
- [x] Create RiskLimitBreaches admin page with active/resolved breach tables and Re-enable Trading dialog
- [x] Add Risk Limit Breaches link to admin sidebar nav
- [x] Tests passing (4/4)
- [x] Checkpoint saved

### Breach Count Badge on Admin Sidebar
- [ ] Query count of active unresolved risk limit breaches in AdminLayout
- [ ] Show red count badge on "Risk Limit Breaches" nav item when count > 0
- [ ] Auto-refresh badge count every 30 seconds
- [ ] Hide badge when all breaches are resolved

### Bulk Resolve Risk Limit Breaches
- [ ] Add "Resolve All" button on Risk Limit Breaches page (visible only when active breaches exist)
- [ ] Show confirmation dialog before bulk resolving (count of breaches to be resolved)
- [ ] Call resolveRiskLimitBreach for each active breach in sequence
- [ ] Refresh breach list after bulk resolve completes

### Risk Limit History per Trader
- [ ] Add riskLimitHistory table to schema (traderId, oldLimit, newLimit, changedAt, changedBy)
- [ ] Record each risk limit change in history when updateTraderRiskLimit is called
- [ ] Show history log in Edit Trader dialog (small table: Date, Old Limit, New Limit, Changed By)
- [ ] Push schema migration and add DB helpers

### Sticky Name and Magic Columns in Manage Traders
- [x] Freeze Name column as sticky left (position: sticky, left: 0)
- [x] Freeze Magic column as sticky left (position: sticky, left: 160px)
- [x] Add bg-background to sticky cells to prevent content bleed-through
- [x] Applied to both TableHead (z-20) and TableCell (z-10) rows
- [x] Table wrapper set to overflow-x-auto for horizontal scroll

### Manage Traders Table UX Improvements
- [x] Freeze Actions column on the right (sticky right-0 z-10 bg-background)
- [x] Sticky header row (TableHeader sticky top-0 z-30, sticky cells z-40)
- [x] Table container max-height for vertical scrolling (calc(100vh-220px))
- [x] Column visibility toggle dropdown (Columns button with DropdownMenuCheckboxItem)
- [x] 13 optional columns: Manager, Profit Share, Copy Rate, MT Account, MT Server, MT Version, MC Location, Lifetime Profit, Lifetime Share, Lifetime Income, Risk Limit, Telegram, Status

### Persist Column Visibility in localStorage
- [x] Replace useState initializer with localStorage-backed initial value
- [x] Persist visibleColumns to localStorage on every toggle
- [x] Key: rfx-manage-traders-columns

### Breach Count Badge on Admin Sidebar
- [x] Add backend tRPC procedure to count active unresolved risk limit breaches
- [x] Fetch count in AdminLayout with 30s polling
- [x] Show red badge on "Risk Limit Breaches" nav item when count > 0
- [x] Hide badge when count is 0

### Bulk Resolve Risk Limit Breaches
- [x] Add bulkResolveRiskLimitBreaches tRPC procedure (resolves all active breaches)
- [x] Add "Resolve All" button on Risk Limit Breaches page (visible only when active breaches exist)
- [x] Show confirmation AlertDialog with breach count before resolving
- [x] Refresh breach list after bulk resolve completes

### Open Positions UI Updates
- [x] Change bold/red text in Open Positions to bold green
- [x] Add "Your maximum lot size per trade: {maxLotSizeThreshold}" below max open trades line
- [x] Source maxLotSizeThreshold from account features Trade Guardrails setting (type 37)

### Open Positions Bold Green Values + Lot Size Fix
- [x] Debug getMaxLotSize returning null despite type 37 feature existing — root cause was server not restarted after procedure was added (404 NOT_FOUND); fixed by restarting server
- [x] Make multiplier value bold green in "multiplied by Xx" line
- [x] Make max open trades value bold green
- [x] Make max lot size value bold green (or "unavailable" in muted when null)
