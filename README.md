# RFX Trader Dashboard

A secure web-based P&L tracking dashboard for MetaCopier.io trading accounts with magic number authentication and real-time position monitoring.

## Features

### Authentication & Security
- **Magic Number Authentication**: Secure login system using trading account identifiers
- **Session Management**: JWT-based sessions with configurable expiration (7-30 days)
- **Remember Me**: Optional credential persistence using localStorage
- **Password Protection**: Individual password support per magic number

### Dashboard
- **Real-time P&L Tracking**: 
  - Today's total P&L (realized + floating)
  - Weekly, monthly, and all-time performance metrics
  - Automatic refresh every 30-60 seconds
- **Profit Share Calculation**: Displays 35% profit share on positive weekly P&L
- **Open Positions**: Live view of active trades with:
  - Symbol, type (BUY/SELL), volume
  - Current profit with color-coded indicators
  - Entry price and current status

### Trade History
- **Date-Grouped View**: Historical trades organized by close date
- **Expandable Sections**: Click to view detailed trade information
- **Comprehensive Details**: 
  - Entry and exit prices
  - Trade duration and timestamps
  - Profit/loss with swap and commission

### User Experience
- **Responsive Design**: Optimized for desktop, tablet, and mobile devices
- **Manual Refresh**: Pull-to-refresh functionality on all data views
- **Loading States**: Skeleton loaders during data fetching
- **Empty States**: Helpful messages when no data is available
- **Error Handling**: User-friendly error messages with retry options

## Technology Stack

### Backend
- **Runtime**: Node.js with Express
- **API Framework**: tRPC 11 for type-safe API calls
- **Database**: MySQL/TiDB with Drizzle ORM
- **Authentication**: Custom session management with secure cookies
- **External API**: MetaCopier.io REST API integration

### Frontend
- **Framework**: React 19 with TypeScript
- **Routing**: Wouter for lightweight client-side routing
- **State Management**: TanStack Query (React Query) for server state
- **UI Components**: shadcn/ui with Radix UI primitives
- **Styling**: Tailwind CSS 4 with custom trading theme
- **Icons**: Lucide React

## Project Structure

```
rfx-trader-web/
├── client/                 # Frontend application
│   └── src/
│       ├── pages/         # Page components (Login, Dashboard, History)
│       ├── hooks/         # Custom React hooks (useTradingSession)
│       ├── components/    # Reusable UI components
│       └── lib/           # tRPC client configuration
├── server/                # Backend application
│   ├── routers.ts        # tRPC router definitions
│   ├── db.ts             # Database query helpers
│   ├── metacopier.ts     # MetaCopier API service
│   └── *.test.ts         # Backend tests
├── drizzle/              # Database schema and migrations
│   └── schema.ts         # Table definitions
└── scripts/              # Utility scripts
    └── seed-magic-numbers.mjs  # Database seeding
```

## API Integration

### MetaCopier.io Endpoints Used

1. **Get Open Positions**
   - Endpoint: `/accounts/{accountId}/positions`
   - Refresh: Every 30 seconds
   - Filters: By magic number

2. **Get Historical Positions**
   - Endpoint: `/accounts/{accountId}/history/positions`
   - Parameters: start date, end date
   - Refresh: Every 60 seconds (varies by time range)
   - Filters: By magic number and date range

3. **Get Account Information**
   - Endpoint: `/accounts/{accountId}/information`
   - Returns: Balance, equity, margin, etc.
   - Refresh: Every 30 seconds

### P&L Calculation

```typescript
P&L = Σ(profit + swap + commission)
```

- **Floating P&L**: Sum of open positions
- **Realized P&L**: Sum of closed positions in time period
- **Total P&L**: Floating + Realized

## Database Schema

### Magic Numbers Table
Stores trading account configurations:
- `magicNumber`: Unique identifier
- `name`: Friendly display name
- `password`: Authentication credential
- `profitShare`: Percentage (default 35%)
- `showAllData`: Admin flag for viewing all accounts
- `isActive`: Enable/disable account

### Trading Sessions Table
Tracks active user sessions:
- `sessionToken`: Unique session identifier
- `magicNumberId`: Associated magic number
- `ipAddress`: Client IP for security
- `userAgent`: Browser information
- `expiresAt`: Session expiration timestamp

## Configuration

### Environment Variables

Required secrets (automatically configured):
- `METACOPIER_API_KEY`: MetaCopier API authentication key
- `METACOPIER_ACCOUNT_ID`: MetaCopier account UUID
- `DATABASE_URL`: MySQL connection string
- `JWT_SECRET`: Session signing secret

### Magic Numbers

Magic numbers are seeded from the original iOS app configuration:
- 16 pre-configured trading accounts
- Default password: `VV8UUFa3p_B-ZcY`
- One admin account (Richard #6868) with custom password
- All accounts have 35% profit share

## Development

### Running Tests

```bash
# Run all tests
pnpm test

# Run specific test file
pnpm test metacopier.test.ts
pnpm test trading.auth.test.ts
```

### Database Management

```bash
# Push schema changes
pnpm db:push

# Seed magic numbers
pnpm exec tsx scripts/seed-magic-numbers.mjs
```

### Type Safety

The application uses tRPC for end-to-end type safety:
- Backend procedures define input/output types
- Frontend automatically infers types from backend
- No manual API client code or type definitions needed

## Mobile App Considerations

This web application is architected to support future iOS and Android clients:

1. **API-First Design**: All business logic is in tRPC procedures
2. **Stateless Backend**: Session-based auth works across platforms
3. **Consistent Data Models**: TypeScript types can be shared
4. **Proven Integration**: Logic validated from existing iOS app

### For Mobile Development

- Use the same tRPC endpoints via HTTP
- Implement native session storage (Keychain/Keystore)
- Reuse P&L calculation logic
- Maintain consistent magic number authentication flow

## Security Notes

- API keys are stored server-side only
- Sessions use secure HTTP-only cookies
- Passwords are stored in plaintext (consider hashing for production)
- CORS is configured for the application domain
- Rate limiting should be added for production use

## Future Enhancements

- [ ] Password hashing with bcrypt
- [ ] Rate limiting on authentication endpoints
- [ ] WebSocket support for real-time updates
- [ ] Export trade history to CSV/PDF
- [ ] Advanced filtering and search
- [ ] Performance analytics and charts
- [ ] Push notifications for significant P&L changes
- [ ] Multi-language support
