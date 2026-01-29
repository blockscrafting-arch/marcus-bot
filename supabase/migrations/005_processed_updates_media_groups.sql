-- Таблица для дедупликации update_id от Telegram
CREATE TABLE IF NOT EXISTS marcus_processed_updates (
  update_id BIGINT PRIMARY KEY,
  processed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_marcus_processed_updates_processed_at
  ON marcus_processed_updates(processed_at);

-- Буферизация фото-альбомов (media_group_id)
CREATE TABLE IF NOT EXISTS marcus_media_groups (
  media_group_id TEXT PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES marcus_users(telegram_id) ON DELETE CASCADE,
  caption TEXT,
  file_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  processed_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX IF NOT EXISTS idx_marcus_media_groups_user_id
  ON marcus_media_groups(user_id);

CREATE INDEX IF NOT EXISTS idx_marcus_media_groups_updated_at
  ON marcus_media_groups(updated_at);

CREATE INDEX IF NOT EXISTS idx_marcus_media_groups_processed_at
  ON marcus_media_groups(processed_at);
