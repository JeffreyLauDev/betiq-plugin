// Supabase configuration
// SET YOUR SUPABASE CREDENTIALS HERE

(function () {
  "use strict";

  window.betIQ = window.betIQ || {};

  // ============================================
  // SUPABASE CONFIGURATION
  // ============================================
  // Replace these with your actual Supabase project credentials
  // You can find these in your Supabase project settings:
  // https://app.supabase.com/project/YOUR_PROJECT/settings/api

  window.betIQ.supabaseUrl = "https://swryqkixpqhvuagnqqul.supabase.co";
  window.betIQ.supabaseAnonKey =
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN3cnlxa2l4cHFodnVhZ25xcXVsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjMwNTgwNDQsImV4cCI6MjA3ODYzNDA0NH0.h1fhmuEhJjmBYZiy2g8L-oorR2fzpwiuXVxEx4mTTUA";

  // ============================================
  // DATABASE SCHEMA REQUIRED
  // ============================================
  // You need to create these tables in your Supabase database:
  //
  // 1. user_config table:
  //    CREATE TABLE user_config (
  //      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  //      user_id UUID REFERENCES auth.users(id) UNIQUE NOT NULL,
  //      bankroll DECIMAL,
  //      kelly_fraction DECIMAL,
  //      updated_at TIMESTAMP DEFAULT NOW(),
  //      created_at TIMESTAMP DEFAULT NOW()
  //    );
  //
  // 2. user_stake_allocations table:
  //    CREATE TABLE user_stake_allocations (
  //      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  //      user_id UUID REFERENCES auth.users(id) NOT NULL,
  //      bet_id TEXT NOT NULL,
  //      stake_amount DECIMAL NOT NULL,
  //      updated_at TIMESTAMP DEFAULT NOW(),
  //      created_at TIMESTAMP DEFAULT NOW(),
  //      UNIQUE(user_id, bet_id)
  //    );
  //
  // 3. user_mix_bet_combinations table:
  //    CREATE TABLE user_mix_bet_combinations (
  //      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  //      user_id UUID REFERENCES auth.users(id) NOT NULL,
  //      combination_key TEXT NOT NULL,
  //      created_at TIMESTAMP DEFAULT NOW(),
  //      UNIQUE(user_id, combination_key)
  //    );
  //
  // 4. Enable Row Level Security (RLS) and create policies:
  //    - Users can only read/write their own data
  //    - Users can read other users' data for real-time sync (optional, or use service role)
  //
  // 5. Enable real-time for these tables in Supabase dashboard
  //    - Go to Database > Replication
  //    - Enable replication for: user_config, user_stake_allocations, user_mix_bet_combinations
})();
