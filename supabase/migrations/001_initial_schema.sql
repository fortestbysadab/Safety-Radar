-- =============================================================================
-- Community Safety Intelligence Platform
-- Initial Schema Migration (001_initial_schema.sql)
--
-- Includes:
--   1. PostGIS extension enablement
--   2. safety_reports table with geospatial support
--   3. report_votes table (for community upvote/downvote verification)
--   4. Spatial + performance indexes
--   5. Row Level Security (RLS) policies
--   6. Helper / utility functions (expiry, hazard fetching, voting)
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. EXTENSIONS
-- -----------------------------------------------------------------------------

-- Enable PostGIS for geospatial queries (GEOGRAPHY, ST_DWithin, GIST indexes).
CREATE EXTENSION IF NOT EXISTS postgis;

-- -----------------------------------------------------------------------------
-- 2. CORE TABLES
-- -----------------------------------------------------------------------------

-- 2.1  safety_reports
--      One record per crowdsourced hazard pin. All user identity is stored as an
--      HMAC-SHA256 hash (anon_user_hash) — no email, name, or Google ID is ever
--      persisted in this table.
CREATE TABLE IF NOT EXISTS public.safety_reports (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    anon_user_hash  VARCHAR(64)  NOT NULL,
    category        VARCHAR(50)  NOT NULL,
    description     TEXT,
    location        GEOGRAPHY(Point, 4326) NOT NULL,
    status          VARCHAR(20)  NOT NULL DEFAULT 'active',
    upvotes         INT          NOT NULL DEFAULT 1,
    downvotes       INT          NOT NULL DEFAULT 0,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    expires_at      TIMESTAMPTZ  NOT NULL,

    -- Data integrity constraints
    CONSTRAINT chk_category CHECK (
        category IN (
            'FOLLOWING',
            'HARASSMENT',
            'POOR_LIGHTING',
            'DESERTED_AREA',
            'UNSAFE_TRANSIT'
        )
    ),
    CONSTRAINT chk_status CHECK (
        status IN ('active', 'cleared', 'expired')
    )
);

-- 2.2  report_votes
--      Tracks each anonymous user's upvote / downvote on a report so we can:
--        * prevent double-voting,
--        * atomically update upvotes/downvotes counters,
--        * implement the "Area Clear" community-verification decay.
CREATE TABLE IF NOT EXISTS public.report_votes (
    id              BIGSERIAL PRIMARY KEY,
    report_id       UUID        NOT NULL REFERENCES public.safety_reports(id) ON DELETE CASCADE,
    anon_user_hash  VARCHAR(64) NOT NULL,
    vote_type       VARCHAR(10) NOT NULL, -- 'up' | 'down'
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT chk_vote_type CHECK (vote_type IN ('up', 'down')),
    -- One vote per anonymous user per report
    CONSTRAINT uq_vote_user_report UNIQUE (report_id, anon_user_hash)
);

-- -----------------------------------------------------------------------------
-- 3. INDEXES
-- -----------------------------------------------------------------------------

-- 3.1 Geospatial index for fast ST_DWithin radius queries
CREATE INDEX IF NOT EXISTS idx_safety_reports_location
    ON public.safety_reports
    USING GIST (location);

-- 3.2 Composite index for the "active hazards" access pattern:
--     filter by status + expiry, then sort by recency.
CREATE INDEX IF NOT EXISTS idx_safety_reports_active_recent
    ON public.safety_reports (status, expires_at, created_at DESC);

-- 3.3 Index for per-user rate-limit lookups
CREATE INDEX IF NOT EXISTS idx_safety_reports_user_time
    ON public.safety_reports (anon_user_hash, created_at DESC);

-- 3.4 Index for vote lookups
CREATE INDEX IF NOT EXISTS idx_report_votes_report
    ON public.report_votes (report_id);

-- -----------------------------------------------------------------------------
-- 4. HELPER FUNCTIONS
-- -----------------------------------------------------------------------------

-- 4.1  fn_set_expires_at()
--      BEFORE-INSERT trigger that automatically assigns an expires_at timestamp
--      based on the report category (see spec §3 Hazard Categories).
CREATE OR REPLACE FUNCTION public.fn_set_expires_at()
RETURNS TRIGGER AS $$
BEGIN
    -- Only apply default if the caller didn't explicitly set expires_at.
    IF NEW.expires_at IS NULL THEN
        NEW.expires_at := CASE NEW.category
            WHEN 'FOLLOWING'        THEN NOW() + INTERVAL '2 hours'
            WHEN 'HARASSMENT'       THEN NOW() + INTERVAL '3 hours'
            WHEN 'POOR_LIGHTING'    THEN NOW() + INTERVAL '48 hours'
            WHEN 'DESERTED_AREA'    THEN NOW() + INTERVAL '24 hours'
            WHEN 'UNSAFE_TRANSIT'   THEN NOW() + INTERVAL '12 hours'
            ELSE NOW() + INTERVAL '4 hours'  -- safety net
        END;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_safety_reports_set_expires ON public.safety_reports;
CREATE TRIGGER trg_safety_reports_set_expires
    BEFORE INSERT ON public.safety_reports
    FOR EACH ROW
    EXECUTE FUNCTION public.fn_set_expires_at();

-- -----------------------------------------------------------------------------
-- 5. CORE API FUNCTION
-- -----------------------------------------------------------------------------

-- 5.1  get_active_hazards(user_lat, user_lng, radius_meters)
--      Returns all non-expired, non-cleared reports within the given radius
--      (meters) of the supplied WGS84 coordinate. Results include distance
--      in meters from the query point, ordered closest-first.
--
--      NOTE: Longitude is the X ordinate, latitude is Y for ST_MakePoint.
CREATE OR REPLACE FUNCTION public.get_active_hazards(
    user_lat        FLOAT,
    user_lng        FLOAT,
    radius_meters   INT DEFAULT 2000
)
RETURNS TABLE (
    id                UUID,
    category          VARCHAR,
    description       TEXT,
    status            VARCHAR,
    upvotes           INT,
    downvotes         INT,
    distance_meters   FLOAT,
    created_at        TIMESTAMPTZ,
    expires_at        TIMESTAMPTZ,
    lat               FLOAT,
    lng               FLOAT
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        sr.id,
        sr.category,
        sr.description,
        sr.status,
        sr.upvotes,
        sr.downvotes,
        ST_Distance(
            sr.location,
            ST_SetSRID(ST_MakePoint(user_lng, user_lat), 4326)::geography
        )::FLOAT AS distance_meters,
        sr.created_at,
        sr.expires_at,
        ST_Y(sr.location::geometry) AS lat,
        ST_X(sr.location::geometry) AS lng
    FROM public.safety_reports sr
    WHERE sr.status = 'active'
      AND sr.expires_at > NOW()
      AND ST_DWithin(
            sr.location,
            ST_SetSRID(ST_MakePoint(user_lng, user_lat), 4326)::geography,
            radius_meters
          )
    ORDER BY distance_meters ASC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- -----------------------------------------------------------------------------
-- 6. COMMUNITY VOTE / CLEAR FUNCTION
-- -----------------------------------------------------------------------------

-- 6.1  fn_cast_vote(p_report_id, p_anon_user_hash, p_vote_type)
--      Atomically casts or changes an anonymous user's vote on a report and
--      adjusts the upvotes/downvotes counters.  Passing the same vote_type as
--      the existing vote removes it (toggle-off behaviour).
CREATE OR REPLACE FUNCTION public.fn_cast_vote(
    p_report_id       UUID,
    p_anon_user_hash  VARCHAR(64),
    p_vote_type       VARCHAR(10)
)
RETURNS VOID AS $$
DECLARE
    v_existing VARCHAR(10);
BEGIN
    SELECT vote_type INTO v_existing
      FROM public.report_votes
     WHERE report_id = p_report_id AND anon_user_hash = p_anon_user_hash;

    IF v_existing IS NULL THEN
        -- Fresh vote
        INSERT INTO public.report_votes (report_id, anon_user_hash, vote_type)
        VALUES (p_report_id, p_anon_user_hash, p_vote_type);

        IF p_vote_type = 'up' THEN
            UPDATE public.safety_reports SET upvotes = upvotes + 1 WHERE id = p_report_id;
        ELSE
            UPDATE public.safety_reports SET downvotes = downvotes + 1 WHERE id = p_report_id;
        END IF;

    ELSIF v_existing = p_vote_type THEN
        -- Toggle off (same vote re-cast cancels it)
        DELETE FROM public.report_votes
         WHERE report_id = p_report_id AND anon_user_hash = p_anon_user_hash;

        IF p_vote_type = 'up' THEN
            UPDATE public.safety_reports SET upvotes = GREATEST(0, upvotes - 1) WHERE id = p_report_id;
        ELSE
            UPDATE public.safety_reports SET downvotes = GREATEST(0, downvotes - 1) WHERE id = p_report_id;
        END IF;

    ELSE
        -- Switch vote (up <-> down)
        UPDATE public.report_votes
           SET vote_type = p_vote_type
         WHERE report_id = p_report_id AND anon_user_hash = p_anon_user_hash;

        UPDATE public.safety_reports
           SET upvotes   = CASE WHEN p_vote_type = 'up'   THEN upvotes + 1   ELSE upvotes - 1   END,
               downvotes = CASE WHEN p_vote_type = 'down' THEN downvotes + 1 ELSE downvotes - 1 END
         WHERE id = p_report_id;
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 6.2  fn_clear_report(p_report_id, p_anon_user_hash)
--      "Area Clear" action: casts a downvote (as community verification) and,
--      if the cumulative downvotes threshold is met, immediately expires the
--      report so it drops off the heatmap.
CREATE OR REPLACE FUNCTION public.fn_clear_report(
    p_report_id       UUID,
    p_anon_user_hash  VARCHAR(64)
)
RETURNS VOID AS $$
DECLARE
    v_downvotes INT;
BEGIN
    PERFORM public.fn_cast_vote(p_report_id, p_anon_user_hash, 'down');

    SELECT downvotes INTO v_downvotes
      FROM public.safety_reports
     WHERE id = p_report_id;

    -- Threshold: 3 independent "clear" votes -> mark cleared / expire now.
    IF v_downvotes >= 3 THEN
        UPDATE public.safety_reports
           SET status     = 'cleared',
               expires_at = NOW()
         WHERE id = p_report_id AND status = 'active';
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- -----------------------------------------------------------------------------
-- 7. ROW LEVEL SECURITY (RLS)
-- -----------------------------------------------------------------------------
-- The backend connects with Supabase's SERVICE_ROLE key which bypasses RLS.
-- Clients connected with the anon / authenticated keys use these policies so
-- they can read public data but cannot write directly — all writes go through
-- the backend API (which enforces rate limits, geofencing, and text sanitization).
-- -----------------------------------------------------------------------------

ALTER TABLE public.safety_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.report_votes  ENABLE ROW LEVEL SECURITY;

-- 7.1  Safety reports: publicly readable (active, non-expired only for anon)
DROP POLICY IF EXISTS p_safety_reports_read ON public.safety_reports;
CREATE POLICY p_safety_reports_read
    ON public.safety_reports
    FOR SELECT
    USING (true);   -- Allow reads of all rows; function-level logic filters active/expired.

-- 7.2  Safety reports: inserts restricted to service role (backend-only)
DROP POLICY IF EXISTS p_safety_reports_insert ON public.safety_reports;
CREATE POLICY p_safety_reports_insert
    ON public.safety_reports
    FOR INSERT
    WITH CHECK (auth.role() = 'service_role');

-- 7.3  Safety reports: updates restricted to service role
DROP POLICY IF EXISTS p_safety_reports_update ON public.safety_reports;
CREATE POLICY p_safety_reports_update
    ON public.safety_reports
    FOR UPDATE
    USING (auth.role() = 'service_role');

-- 7.4  Report votes: all mutations through service role only
DROP POLICY IF EXISTS p_report_votes_all ON public.report_votes;
CREATE POLICY p_report_votes_all
    ON public.report_votes
    FOR ALL
    USING (auth.role() = 'service_role')
    WITH CHECK (auth.role() = 'service_role');

-- 7.5  Grant public execution on the read-only hazard function (safe for anon keys)
GRANT EXECUTE ON FUNCTION public.get_active_hazards(FLOAT, FLOAT, INT) TO anon, authenticated;

-- =============================================================================
-- END OF MIGRATION
-- =============================================================================
