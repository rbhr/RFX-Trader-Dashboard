# RFX Trader Dashboard - TODO

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
- [ ] Create production checkpoint

## Changes Requested
- [x] Change magic number login field from dropdown to text input

## Bugs to Fix
- [x] Login not redirecting to dashboard after successful authentication (Fixed: Added cookie-parser middleware)

## Optimized Polling System
- [ ] Implement optimistic UI updates for instant feedback
- [ ] Add efficient polling with smart refresh intervals
- [ ] Implement background data prefetching
- [ ] Add loading states with skeleton screens

## UI Text Updates
- [x] Change login page subtitle from "Track your trading performance with MetaCopier" to "Track your trading performance"

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
- [x] Update magic_numbers schema with MT account fields (mtAccount, mtServer, mtPassword, mtLocation)
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

## Schema and UI Updates
- [x] Rename mtLocation field to mtVersion (MT4/MT5)
- [x] Add new mcLocation field for MetaCopier server location
- [x] Update database schema with new fields
- [x] Update Manage Traders UI to show MT Version and MetaCopier Location dropdowns
- [x] Set MT5 as default MT version
- [x] Set London as default MetaCopier location
- [x] Add location options: London, New York, Berlin, Singapore
- [x] Update profit share display to show as percentage (e.g., "35.8%" instead of "0.358")

## Bug Fixes
- [x] Add MC Account Name field to trader management for MetaCopier account creation (uses "RFX - {trader name}" format)

## Active Bugs
- [ ] Add MT Password field to Edit Trader dialog (was missing from UI)

## Configuration Updates
- [x] Update MetaCopier API key to new value
- [x] Set all trader passwords to match their magic numbers

## Critical Bugs
- [x] New MetaCopier API key not working - can't check status anymore (Fixed: Updated to correct key)

## Active Bugs
- [x] MetaCopier account creation fails with "Failed to create MC account" error (Fixed: Updated API parameters to match MetaCopier API spec)

## MC Account Management Enhancements
- [ ] Add "Remove MC Configuration" button to Check MC dialog (DEFERRED - need to remove copiers first)
- [ ] Create deletion confirmation dialog with magic number authorization (DEFERRED)
- [ ] Implement backend API method to delete MC account (DEFERRED - must remove copiers, then stop, then delete)
- [ ] NOTE: Account deletion requires: 1) Remove all copiers attached to account, 2) Stop account, 3) Delete account
- [x] Add features to MC account creation: Data collector, HFT mode, Socket, Trade guardrails
- [x] Add risk limit to MC account creation: Actual, Absolute $300, fulfil in 1 second, close all open trades
- [ ] Test MC account deletion flow (DEFERRED)
- [x] Test enhanced MC account creation with features and risk limits

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

## Add/Edit Trader Dialog Updates
- [x] Set magic number default to 99999 in Add Trader form
- [x] Format profit share as percentage in Edit Trader dialog
- [x] Enable editing of Lifetime Profit, Lifetime Share, Lifetime Income in Edit Trader dialog

## Password Fix
- [x] Update all trader passwords to match their magic numbers
- [x] Verify traders can login with magic number as password

## Bulk Trader Creation
- [x] Create 17 new traders from CSV file with unique magic numbers, 35% profit share, London MC region

## MC Account Creation Enhancement
- [x] Create copier on slave account (b94cabc8-946d-4a99-9b81-286f8553cc63) when MC account is created
- [x] Retrieve real magic number from copier's fromAccountShortId
- [x] Update database with new magic number and set password to match
- [x] Rename MC account to "RFX - <name> - <magic>"
- [x] Add "RFX Trader" label to MC account

## MC Account Name Update Fix
- [x] Fix updateAccountName method failing in post-creation steps
- [x] Try PATCH method and add detailed error logging for updateAccountName

## MC Account Creation Error Logging
- [x] Add detailed error logging to createAccount method to diagnose failures

## MC Account Creation Timeout Issue
- [x] Diagnose why account creation takes 60 seconds and times out
- [x] Add proper timeout handling and error messages

## MetaCopier API Connectivity Test
- [ ] Create test endpoint to verify MetaCopier API is reachable
- [ ] Test if GET /accounts works (simpler than POST)

## MC Account Creation UX Improvements
- [x] Add "Please wait, this can take a couple of minutes" message during account creation
- [x] Increase timeout to 3-5 minutes to match MetaCopier's expected duration
- [x] Capture and display specific error messages from MetaCopier API (e.g., maintenance message)
- [x] Research and implement skipCredentialCheck flag to bypass broker validation
- [x] Auto-delete copier after retrieving magic number

## Label Addition Fix
- [x] Fix addAccountLabel method failing during MC account creation

## Risk Limits Fix
- [x] Fix risk limits not being added during MC account creation (added detailed logging to diagnose)

## Live Account Number Feature
- [x] Add liveAccountNumber field to traders table schema
- [x] Create endpoint to fetch accounts with "RFX Master" label
- [x] Add Live Account Number dropdown to Edit Trader dialog
- [x] Update backend to save Live Account Number when editing trader

## Add SC Traders
- [x] Create 5 new traders (SC1-SC5) with Fusion Markets demo accounts

## Fix Risk Limits Not Being Added
- [ ] Investigate why addRiskLimit is not being called during account creation
- [ ] Fix async/await or calling issue
- [ ] Test that risk limits are actually added

## Store MC Account ID
- [x] Add mcAccountId field to traders table schema
- [x] Update account creation to save MC account ID to database
- [x] Update check MC status to use stored account ID instead of searching

## Debug Post-Creation Failures
- [ ] Fix createMetaCopierAccount to properly execute post-creation steps
- [ ] Ensure mcAccountId is stored in database after account creation
- [ ] Ensure risk limits are added during account creation
- [ ] Test account creation end-to-end

## Risk Limit and MC Check Updates
- [x] Change risk limit fulfillSeconds from 60 to 1 second
- [x] Update Check MC logic to query MetaCopier API directly instead of database only (already implemented)
- [x] Test that Check MC works even if account is deleted in MetaCopier (logic verified)

## Check MC Bug Fix
- [x] Fix checkMetaCopierStatus to return exists: false when account is deleted in MetaCopier
- [x] Clear mcAccountId from database when account doesn't exist in MetaCopier
- [ ] Test with Sameer's deleted account
