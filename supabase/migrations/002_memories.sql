-- Long-term memory with pgvector

CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS marcus_memories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id BIGINT REFERENCES marcus_users(telegram_id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  embedding vector(1536),
  memory_type TEXT,
  importance FLOAT DEFAULT 0.5,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_marcus_memories_user_id ON marcus_memories(user_id);

CREATE OR REPLACE FUNCTION match_marcus_memories(
  p_user_id BIGINT,
  p_embedding vector(1536),
  p_match_count INT DEFAULT 5,
  p_similarity_threshold FLOAT DEFAULT 0.75
)
RETURNS TABLE(content TEXT, similarity FLOAT)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT m.content, 1 - (m.embedding <=> p_embedding) AS similarity
  FROM marcus_memories m
  WHERE m.user_id = p_user_id
    AND m.embedding IS NOT NULL
    AND 1 - (m.embedding <=> p_embedding) >= p_similarity_threshold
  ORDER BY m.embedding <=> p_embedding
  LIMIT p_match_count;
END;
$$;
