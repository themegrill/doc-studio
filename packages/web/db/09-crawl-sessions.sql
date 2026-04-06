-- Crawl Sessions Table
-- Holds all state for the polling-driven website crawl.
-- No child processes or filesystem — the DB is the source of truth.
-- Each GET /progress call processes the next batch and updates this row.

CREATE TABLE IF NOT EXISTS crawl_sessions (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_slug   TEXT NOT NULL UNIQUE,
  start_url      TEXT NOT NULL,
  status         TEXT NOT NULL DEFAULT 'crawling',
  -- Cached scalar counts (fast to query without parsing JSONB)
  visited_count          INT NOT NULL DEFAULT 0,
  raw_pages_count        INT NOT NULL DEFAULT 0,
  current_refine_batch   INT NOT NULL DEFAULT 0,
  total_refine_batches   INT NOT NULL DEFAULT 0,
  progress               INT NOT NULL DEFAULT 0,
  message                TEXT NOT NULL DEFAULT 'Starting crawl...',
  error                  TEXT,
  started_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at           TIMESTAMPTZ,
  -- Large JSONB data (fetched only during processing, not for status reads)
  queue_urls       JSONB NOT NULL DEFAULT '[]',
  visited_urls     JSONB NOT NULL DEFAULT '[]',
  raw_pages        JSONB NOT NULL DEFAULT '[]',
  refined_batches  JSONB NOT NULL DEFAULT '[]'
);

CREATE INDEX IF NOT EXISTS idx_crawl_sessions_project_slug ON crawl_sessions(project_slug);
