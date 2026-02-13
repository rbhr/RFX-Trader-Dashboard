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
