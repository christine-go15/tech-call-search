-- Run this once in Neon's SQL Editor (see README Step 5).
-- It sets up the table that stores every chunk of every call transcript,
-- along with the embedding vector used for semantic search.

CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS call_chunks (
  id SERIAL PRIMARY KEY,
  call_date DATE NOT NULL,
  call_title TEXT,
  start_seconds INTEGER NOT NULL,
  end_seconds INTEGER NOT NULL,
  speaker TEXT,
  text TEXT NOT NULL,
  embedding VECTOR(768),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Speeds up similarity search once you have more than a few hundred chunks.
-- Safe to run even now; it just won't do much good until there's real data.
CREATE INDEX IF NOT EXISTS call_chunks_embedding_idx
  ON call_chunks
  USING hnsw (embedding vector_cosine_ops);

-- Handy index for browsing/filtering by date later if you build an admin view.
CREATE INDEX IF NOT EXISTS call_chunks_date_idx ON call_chunks (call_date);
