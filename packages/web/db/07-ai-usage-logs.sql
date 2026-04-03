-- AI Usage Logs Table
-- Tracks token usage and cost per AI feature call.

CREATE TABLE IF NOT EXISTS ai_usage_logs (
    id                 SERIAL PRIMARY KEY,
    user_id            VARCHAR(255),
    feature            VARCHAR(50)           NOT NULL,
    model              VARCHAR(50)           NOT NULL,
    prompt_tokens      INTEGER               NOT NULL,
    completion_tokens  INTEGER               NOT NULL,
    total_tokens       INTEGER               NOT NULL,
    estimated_cost     DECIMAL(10, 6),
    duration_ms        INTEGER,
    success            BOOLEAN               DEFAULT true,
    error_message      TEXT,
    project_id         VARCHAR(255),
    metadata           JSONB,
    created_at         TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_usage_created_at ON ai_usage_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_usage_user_id    ON ai_usage_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_ai_usage_feature    ON ai_usage_logs(feature);
