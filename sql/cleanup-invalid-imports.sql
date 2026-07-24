-- Cleanup historical invalid import records
-- 
-- This script updates historical records where:
--   - status = 'completed'
--   - is_active = 0
--   - total_accepted_rows = 0 AND error_count > 0
--
-- These records were created before proper validation was implemented.
-- They should be marked as 'failed' for consistency.
--
-- Execute manually against the nsw_transit database:
--   mysql -u root nsw_transit < sql/cleanup-invalid-imports.sql
--
-- Or via XAMPP phpMyAdmin:
--   Copy and paste this script into the SQL tab

-- Preview: count affected records (run first to verify)
SELECT 
    COUNT(*) as affected_records,
    SUM(CASE WHEN error_count > 0 THEN 1 ELSE 0 END) as with_errors,
    SUM(CASE WHEN total_accepted_rows = 0 THEN 1 ELSE 0 END) as with_zero_accepted
FROM gtfs_feed_imports
WHERE status = 'completed'
  AND is_active = 0
  AND total_accepted_rows = 0
  AND error_count > 0;

-- Update: mark historical invalid records as failed
UPDATE gtfs_feed_imports
SET 
    status = 'failed',
    is_active = 0
WHERE status = 'completed'
  AND is_active = 0
  AND total_accepted_rows = 0
  AND error_count > 0;

-- Verify: show updated records
SELECT 
    id,
    status,
    is_active,
    total_accepted_rows,
    error_count,
    completed_at
FROM gtfs_feed_imports
WHERE status = 'failed'
ORDER BY completed_at DESC
LIMIT 20;