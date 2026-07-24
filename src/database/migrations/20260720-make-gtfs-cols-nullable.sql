-- Make GTFS columns nullable
-- These columns may be legitimately blank in some GTFS feeds

-- Make stop coordinates nullable (some stops don't have location data)
ALTER TABLE `gtfs_stops` MODIFY `stop_lat` DECIMAL(10,7) NULL;
ALTER TABLE `gtfs_stops` MODIFY `stop_lon` DECIMAL(10,7) NULL;

-- Make stop time fields nullable (arrival/departure times may be omitted)
ALTER TABLE `gtfs_stop_times` MODIFY `arrival_time` VARCHAR(32) NULL;
ALTER TABLE `gtfs_stop_times` MODIFY `departure_time` VARCHAR(32) NULL;