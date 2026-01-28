-- Initial schema for Marcus bot

CREATE TABLE IF NOT EXISTS marcus_users (
  telegram_id BIGINT PRIMARY KEY,
  username TEXT,
  first_name TEXT,
  last_name TEXT,
  is_premium BOOLEAN DEFAULT FALSE,
  timezone TEXT DEFAULT 'Europe/Moscow',
  preferences JSONB DEFAULT '{}'::jsonb,
  onboarding_completed BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS marcus_messages (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES marcus_users(telegram_id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_marcus_messages_user_id ON marcus_messages(user_id);
CREATE INDEX IF NOT EXISTS idx_marcus_messages_created_at ON marcus_messages(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_marcus_messages_user_created ON marcus_messages(user_id, created_at DESC);

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_marcus_users_updated_at ON marcus_users;
CREATE TRIGGER update_marcus_users_updated_at
  BEFORE UPDATE ON marcus_users
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
