-- Fix GTFS ID column collations to utf8mb4_bin (case-sensitive)
-- The schema specifies utf8mb4_bin but the database may have inherited
-- a case-insensitive collation from the table default.
-- This is critical for service_id, stop_id, route_id, trip_id, etc.
-- to avoid false duplicate key errors on case-differing IDs.
--
-- Each MODIFY uses the same definition as the existing column but adds
-- CHARACTER SET utf8mb4 COLLATE utf8mb4_bin. Running this migration
-- repeatedly is safe because the final column definition does not change.

-- gtfs_agencies
ALTER TABLE `gtfs_agencies` MODIFY `agency_id` VARCHAR(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NULL;

-- gtfs_calendar
ALTER TABLE `gtfs_calendar` MODIFY `service_id` VARCHAR(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL;

-- gtfs_calendar_dates
ALTER TABLE `gtfs_calendar_dates` MODIFY `service_id` VARCHAR(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL;

-- gtfs_frequencies
ALTER TABLE `gtfs_frequencies` MODIFY `trip_id` VARCHAR(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL;

-- gtfs_routes (already utf8mb4_bin in schema.sql but may not be in existing DB)
ALTER TABLE `gtfs_routes` MODIFY `route_id` VARCHAR(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL;
ALTER TABLE `gtfs_routes` MODIFY `agency_id` VARCHAR(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NULL;

-- gtfs_shapes
ALTER TABLE `gtfs_shapes` MODIFY `shape_id` VARCHAR(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL;

-- gtfs_stops (already utf8mb4_bin in schema.sql but may not be in existing DB)
ALTER TABLE `gtfs_stops` MODIFY `stop_id` VARCHAR(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL;

-- gtfs_stop_times (already utf8mb4_bin in schema.sql but may not be in existing DB)
ALTER TABLE `gtfs_stop_times` MODIFY `trip_id` VARCHAR(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL;
ALTER TABLE `gtfs_stop_times` MODIFY `stop_id` VARCHAR(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL;

-- gtfs_transfers (stop IDs, used in joins)
ALTER TABLE `gtfs_transfers` MODIFY `from_stop_id` VARCHAR(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL;
ALTER TABLE `gtfs_transfers` MODIFY `to_stop_id` VARCHAR(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL;

-- gtfs_trips (already utf8mb4_bin in schema.sql but may not be in existing DB)
ALTER TABLE `gtfs_trips` MODIFY `route_id` VARCHAR(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL;
ALTER TABLE `gtfs_trips` MODIFY `service_id` VARCHAR(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL;
ALTER TABLE `gtfs_trips` MODIFY `trip_id` VARCHAR(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL;
ALTER TABLE `gtfs_trips` MODIFY `block_id` VARCHAR(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NULL;
ALTER TABLE `gtfs_trips` MODIFY `shape_id` VARCHAR(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NULL;