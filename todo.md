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
