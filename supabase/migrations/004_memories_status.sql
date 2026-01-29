-- Soft inactive memory: is_active, expires_at

ALTER TABLE marcus_memories
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ NULL;

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
    AND (m.is_active IS NULL OR m.is_active = TRUE)
    AND (m.expires_at IS NULL OR m.expires_at > NOW())
    AND 1 - (m.embedding <=> p_embedding) >= p_similarity_threshold
  ORDER BY m.embedding <=> p_embedding
  LIMIT p_match_count;
END;
$$;
