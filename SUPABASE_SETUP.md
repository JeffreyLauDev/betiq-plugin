# Supabase Setup Guide

## Step 1: Configure Supabase Credentials

Edit `js/config/supabaseConfig.js` and add your Supabase credentials:

```javascript
window.betIQ.supabaseUrl = "https://swryqkixpqhvuagnqqul.supabase.co";
window.betIQ.supabaseAnonKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN3cnlxa2l4cHFodnVhZ25xcXVsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjMwNTgwNDQsImV4cCI6MjA3ODYzNDA0NH0.h1fhmuEhJjmBYZiy2g8L-oorR2fzpwiuXVxEx4mTTUA";
```
supabase passowrd: supabase password: 5p9o3WGa9BkxJNLA
You can find these in your Supabase project:
- Go to https://app.supabase.com
- Select your project
- Go to Settings > API
- Copy "Project URL" and "anon public" key

## Step 2: Create Database Tables

Run these SQL commands in your Supabase SQL Editor:

```sql
-- 1. User Config Table
CREATE TABLE user_config (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id) UNIQUE NOT NULL,
  bankroll DECIMAL,
  kelly_fraction DECIMAL,
  updated_at TIMESTAMP DEFAULT NOW(),
  created_at TIMESTAMP DEFAULT NOW()
);

-- 2. User Stake Allocations Table
CREATE TABLE user_stake_allocations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id) NOT NULL,
  bet_id TEXT NOT NULL,
  stake_amount DECIMAL NOT NULL,
  updated_at TIMESTAMP DEFAULT NOW(),
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(user_id, bet_id)
);

-- 3. User Mix Bet Combinations Table
CREATE TABLE user_mix_bet_combinations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id) NOT NULL,
  combination_key TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(user_id, combination_key)
);

-- 4. Enable Row Level Security (RLS)
ALTER TABLE user_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_stake_allocations ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_mix_bet_combinations ENABLE ROW LEVEL SECURITY;

-- 5. Create RLS Policies (users can only access their own data)
-- User Config
CREATE POLICY "Users can read own config"
  ON user_config FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can update own config"
  ON user_config FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own config"
  ON user_config FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Stake Allocations
CREATE POLICY "Users can read own stake allocations"
  ON user_stake_allocations FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can update own stake allocations"
  ON user_stake_allocations FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own stake allocations"
  ON user_stake_allocations FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own stake allocations"
  ON user_stake_allocations FOR DELETE
  USING (auth.uid() = user_id);

-- Mix Bet Combinations
CREATE POLICY "Users can read own mix bet combinations"
  ON user_mix_bet_combinations FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own mix bet combinations"
  ON user_mix_bet_combinations FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own mix bet combinations"
  ON user_mix_bet_combinations FOR DELETE
  USING (auth.uid() = user_id);
```

## Step 3: Enable Real-time Replication

1. Go to your Supabase Dashboard
2. Navigate to Database > Replication
3. Enable replication for:
   - `user_config`
   - `user_stake_allocations`
   - `user_mix_bet_combinations`

## Step 4: Configure OAuth Redirect URLs (Optional)

If you want to use OAuth providers (Google, GitHub, Discord, etc.):

1. Get your extension's redirect URL by running this in the browser console:
   ```javascript
   // In popup.html console or content script
   console.log(`chrome-extension://${chrome.runtime.id}/popup.html`);
   ```

2. Go to your Supabase Dashboard
3. Navigate to Authentication > URL Configuration
4. Add your extension's redirect URL to the "Redirect URLs" list:
   ```
   chrome-extension://YOUR_EXTENSION_ID/popup.html
   ```

5. For each OAuth provider you want to enable:
   - Go to Authentication > Providers
   - Enable the provider (Google, GitHub, etc.)
   - Configure the provider's OAuth credentials
   - The redirect URL will be automatically used when calling `signInWithOAuth()`

**Note**: The extension uses PKCE flow for OAuth, which is more secure and works well with Chrome extensions.

## Step 5: Create User Accounts

Users can create accounts through:
- Email/Password login (via the extension popup)
- OAuth providers (if configured in Step 4)
- Supabase Auth UI (if you set it up)
- Or programmatically via Supabase Admin API

## Step 6: Test

1. Open the extension popup
2. Login with a test account
3. Make changes (set bankroll, add stake, etc.)
4. Open another browser/device with the extension
5. Login with a different account
6. You should see snackbar notifications when the first user makes changes

## Notes

- **Chrome Storage**: The extension uses `chrome.storage.local` instead of `localStorage` for better reliability in Chrome extensions
- **PKCE Flow**: OAuth authentication uses PKCE (Proof Key for Code Exchange) for enhanced security
- **Session Persistence**: Sessions are automatically saved and restored using Chrome storage
- **Sync only happens when logged in** - Users must be authenticated
- **Only whitelisted state syncs** - UI state (popups, selections) never syncs
- **Notifications show user actions** - Snackbars appear when other users make changes
- **Real-time updates** - Changes appear instantly across all logged-in devices

## Using OAuth Authentication

To use OAuth authentication in your code:

```javascript
// Sign in with Google
await window.betIQ.auth.signInWithOAuth('google');

// Sign in with GitHub
await window.betIQ.auth.signInWithOAuth('github');

// Get the redirect URL for Supabase configuration
const redirectUrl = window.betIQ.auth.getOAuthRedirectUrl();
console.log('Add this to Supabase redirect URLs:', redirectUrl);
```

The OAuth callback is automatically handled in `popup.html` when the user is redirected back from the OAuth provider.

