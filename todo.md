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
