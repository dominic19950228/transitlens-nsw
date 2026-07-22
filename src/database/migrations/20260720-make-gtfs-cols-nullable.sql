ALTER TABLE `gtfs_stops` MODIFY `stop_lat` DECIMAL(10,7) NULL;
ALTER TABLE `gtfs_stops` MODIFY `stop_lon` DECIMAL(10,7) NULL;
ALTER TABLE `gtfs_stop_times` MODIFY `arrival_time` VARCHAR(32) NULL;
ALTER TABLE `gtfs_stop_times` MODIFY `departure_time` VARCHAR(32) NULL;