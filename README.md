# betIQ Plugin - Chrome Extension

A Chrome browser extension that enhances the betIQ platform (https://betiq.vercel.app/) with advanced betting analysis tools, Kelly Criterion stake calculations, multi-bet management, and real-time data synchronization.

## Overview

This extension integrates seamlessly with the betIQ web application to provide professional betting tools directly in your browser. It intercepts API calls, extracts betting data from tables, calculates optimal stake amounts using the Kelly Criterion, and syncs all your betting configurations and allocations across devices in real-time.

## Key Features

### 1. **Kelly Criterion Stake Calculations**
- Automatically calculates optimal stake amounts for each bet using the Kelly Criterion formula
- Takes into account Expected Value (EV) percentage, true odds, bankroll, and Kelly fraction
- Displays calculated stakes in a dedicated column added to the betting table
- Recalculates automatically when bankroll or Kelly fraction settings change

### 2. **Multi-Bet (Mix Bet) Management**
- Select multiple bets from the table to create combination bets
- Visual overlay appears when 2+ bets are selected showing:
  - Combined odds and potential returns
  - Individual bet details
  - Manual stake input for the combination
  - Automatic detection of duplicate games (prevents invalid multi-bets)
- Tracks which bet combinations have been used to prevent duplicate allocations
- Drag-and-drop overlay positioning
- Press Escape key to quickly unselect all bets

### 3. **Real-Time Data Synchronization**
- All user data syncs to Supabase database in real-time
- Multi-user support - see other users' stake allocations on the same bets
- Automatic conflict resolution and change detection
- Syncs the following data:
  - Bankroll and Kelly fraction configuration
  - Individual stake allocations per bet
  - Mix bet combinations used
- Works across multiple browser tabs and devices
- Visual sync status indicator in the extension popup

### 4. **User Authentication**
- Secure login via Supabase authentication
- Session persistence across browser restarts
- Login/logout through extension popup interface
- OAuth callback handling support

### 5. **Configuration Management**
- User-configurable settings panel:
  - Bankroll amount
  - Kelly fraction (0-1 range)
  - Debug mode toggle
- Settings persist and sync across devices
- Real-time updates when settings change

### 6. **Table Enhancement & Data Extraction**
- Automatically detects and extracts data from betIQ betting tables
- Adds custom columns for calculated values
- Monitors table changes (handles React/Next.js dynamic updates)
- Row matching system to track bets across table updates
- Extracts betting data including:
  - Bet IDs
  - Game information
  - Odds and EV percentages
  - True odds
  - Other relevant betting metrics

### 7. **Stake Allocation Tracking**
- Track how much stake has been allocated to each bet
- Visual indicators for stake usage
- Accumulative stake tracking (can add multiple allocations)
- Per-user stake visibility (multi-user support)

### 8. **API Interception**
- Intercepts Supabase API calls from the betIQ application
- Captures betting alerts and data automatically
- Non-intrusive - works alongside the existing application
- Handles both fetch and XHR requests

## Login Credentials

To test the extension, use the following credentials to log into the betIQ platform:

**URL:** https://betiq.vercel.app/

**Email:** bruteb8@gmail.com

**Password:** bruteb8!

After logging into the website, you can also log in through the extension popup to enable sync functionality.

## Architecture Overview

### Extension Structure

The extension uses Manifest V3 and consists of:

- **Content Scripts**: Run in the MAIN world context to interact with the betIQ application
- **Background Service Worker**: Handles storage operations and message passing
- **Popup Interface**: Provides login/logout UI and sync status
- **State Management**: Centralized reactive state system with effects and subscriptions
- **API Interceptors**: Capture and process Supabase API responses
- **Real-Time Sync**: Supabase real-time subscriptions for multi-user collaboration

### Key Modules

- **Authentication Module**: Handles Supabase auth, session management, and user state
- **Sync Module**: Manages real-time synchronization with Supabase database
- **Kelly Stake Module**: Calculates optimal stake amounts using Kelly Criterion
- **Selection Overlay Module**: Manages multi-bet selection interface and calculations
- **Table Generator**: Extracts and enhances betting table data
- **Observer Module**: Monitors DOM changes for React/Next.js compatibility
- **Storage Module**: Unified state management with persistence and sync

### Data Flow

1. Extension loads and initializes on betIQ pages
2. API interceptors capture betting data from Supabase calls
3. Data is processed and stored in centralized state
4. Table columns are enhanced with calculated values
5. User interactions (stake allocations, mix bets) update state
6. State changes trigger automatic sync to Supabase
7. Real-time subscriptions update state when other users make changes
8. UI updates reactively based on state changes

## Technical Details

### Browser Compatibility
- Chrome/Chromium-based browsers (Manifest V3)
- Requires permissions: `activeTab`, `storage`
- Host permissions for betIQ and Supabase domains

### Dependencies
- Supabase JavaScript client library (loaded from CDN)
- Native browser APIs (Chrome Extension APIs)

### State Management
- Centralized reactive state system
- Path-based state access (e.g., `config.bankroll`, `betting.stakeUsage`)
- Effect system for automatic recalculation on state changes
- Selective persistence (UI state vs. synced data)

### Real-Time Sync
- Uses Supabase real-time subscriptions
- Debounced writes to prevent excessive API calls
- Conflict resolution for concurrent edits
- Multi-user visibility with user-specific data isolation

## Development Notes

### Important Considerations

- The extension runs in both ISOLATED and MAIN world contexts
- Content scripts must handle React/Next.js dynamic DOM updates
- API interception must work alongside the existing application
- State synchronization requires careful conflict handling
- Multi-user support means data must be user-scoped

### Testing

- Test with the provided login credentials
- Verify sync across multiple browser tabs
- Test multi-bet combinations with different game selections
- Verify Kelly calculations with various bankroll and fraction settings
- Test table updates when React re-renders components

## Future Enhancements

Potential areas for expansion:
- Additional betting strategy calculations
- Historical performance tracking
- Export/import functionality
- Advanced filtering and sorting
- Betting portfolio analytics
- Integration with additional betting platforms

---

**Note**: This extension is designed to work specifically with the betIQ platform at https://betiq.vercel.app/. It requires an active internet connection and Supabase database access for full functionality.

