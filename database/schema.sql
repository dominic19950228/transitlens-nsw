-- NSW Transit Platform - GTFS schema
-- Compatible with MariaDB 10.4.x / XAMPP
-- Character set: utf8mb4
-- Collation: utf8mb4_unicode_ci

CREATE TABLE IF NOT EXISTS `gtfs_feed_imports` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `source_directory` VARCHAR(1024) NOT NULL,
    `source_archive_sha256` CHAR(64) NULL,
    `status` ENUM('pending', 'completed', 'failed') NOT NULL,
    `is_active` TINYINT(1) NOT NULL DEFAULT 0,
    `started_at` DATETIME(3) NOT NULL,
    `completed_at` DATETIME(3) NULL,
    `failed_at` DATETIME(3) NULL,
    `error_message` TEXT NULL,
    `total_processed_rows` BIGINT UNSIGNED NOT NULL DEFAULT 0,
    `total_accepted_rows` BIGINT UNSIGNED NOT NULL DEFAULT 0,
    `total_rejected_rows` BIGINT UNSIGNED NOT NULL DEFAULT 0,
    `warning_count` BIGINT UNSIGNED NOT NULL DEFAULT 0,
    `error_count` BIGINT UNSIGNED NOT NULL DEFAULT 0,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
        ON UPDATE CURRENT_TIMESTAMP(3),
    PRIMARY KEY (`id`),
    KEY `idx_gtfs_feed_imports_status` (`status`),
    KEY `idx_gtfs_feed_imports_active` (`is_active`)
) ENGINE=InnoDB
  DEFAULT CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `gtfs_agencies` (
    `feed_import_id` BIGINT UNSIGNED NOT NULL,
    `agency_id` VARCHAR(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NULL,
    `agency_name` VARCHAR(500) NOT NULL,
    `agency_url` VARCHAR(2048) NOT NULL,
    `agency_timezone` VARCHAR(255) NOT NULL,
    KEY `idx_agencies_import_agency` (`feed_import_id`, `agency_id`),
    CONSTRAINT `fk_gtfs_agencies_feed_import`
        FOREIGN KEY (`feed_import_id`)
        REFERENCES `gtfs_feed_imports` (`id`)
        ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `gtfs_stops` (
    `feed_import_id` BIGINT UNSIGNED NOT NULL,
    `stop_id` VARCHAR(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
    `stop_name` VARCHAR(500) NOT NULL,
    `stop_lat` DECIMAL(10,7) NULL,
    `stop_lon` DECIMAL(10,7) NULL,
    `location_type` TINYINT UNSIGNED NULL,
    `parent_station` VARCHAR(255) NULL,
    `wheelchair_boarding` TINYINT UNSIGNED NULL,
    UNIQUE KEY `uq_stops_import_stop` (`feed_import_id`, `stop_id`),
    KEY `idx_stops_import_parent` (`feed_import_id`, `parent_station`),
    KEY `idx_stops_location` (`stop_lat`, `stop_lon`),
    CONSTRAINT `fk_gtfs_stops_feed_import`
        FOREIGN KEY (`feed_import_id`)
        REFERENCES `gtfs_feed_imports` (`id`)
        ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `gtfs_routes` (
    `feed_import_id` BIGINT UNSIGNED NOT NULL,
    `route_id` VARCHAR(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
    `agency_id` VARCHAR(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NULL,
    `route_short_name` VARCHAR(255) NULL,
    `route_long_name` VARCHAR(500) NULL,
    `route_type` INT UNSIGNED NOT NULL,
    UNIQUE KEY `uq_routes_import_route` (`feed_import_id`, `route_id`),
    KEY `idx_routes_import_agency` (`feed_import_id`, `agency_id`),
    CONSTRAINT `fk_gtfs_routes_feed_import`
        FOREIGN KEY (`feed_import_id`)
        REFERENCES `gtfs_feed_imports` (`id`)
        ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `gtfs_trips` (
    `feed_import_id` BIGINT UNSIGNED NOT NULL,
    `route_id` VARCHAR(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
    `service_id` VARCHAR(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
    `trip_id` VARCHAR(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
    `trip_headsign` VARCHAR(500) NULL,
    `trip_short_name` VARCHAR(255) NULL,
    `direction_id` TINYINT UNSIGNED NULL,
    `block_id` VARCHAR(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NULL,
    `shape_id` VARCHAR(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NULL,
    `wheelchair_accessible` TINYINT UNSIGNED NULL,
    `bikes_allowed` TINYINT UNSIGNED NULL,
    UNIQUE KEY `uq_trips_import_trip` (`feed_import_id`, `trip_id`),
    KEY `idx_trips_import_route` (`feed_import_id`, `route_id`),
    KEY `idx_trips_import_service` (`feed_import_id`, `service_id`),
    KEY `idx_trips_import_shape` (`feed_import_id`, `shape_id`),
    CONSTRAINT `fk_gtfs_trips_feed_import`
        FOREIGN KEY (`feed_import_id`)
        REFERENCES `gtfs_feed_imports` (`id`)
        ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `gtfs_stop_times` (
    `feed_import_id` BIGINT UNSIGNED NOT NULL,
    `trip_id` VARCHAR(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
    `arrival_time` VARCHAR(32) NULL,
    `departure_time` VARCHAR(32) NULL,
    `stop_id` VARCHAR(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
    `stop_sequence` INT UNSIGNED NOT NULL,
    `stop_headsign` VARCHAR(500) NULL,
    `pickup_type` TINYINT UNSIGNED NULL,
    `drop_off_type` TINYINT UNSIGNED NULL,
    `timepoint` TINYINT UNSIGNED NULL,
    UNIQUE KEY `uq_stop_times_import_trip_sequence` (`feed_import_id`, `trip_id`, `stop_sequence`),
    KEY `idx_stop_times_import_stop` (`feed_import_id`, `stop_id`),
    KEY `idx_stop_times_import_trip` (`feed_import_id`, `trip_id`),
    CONSTRAINT `fk_gtfs_stop_times_feed_import`
        FOREIGN KEY (`feed_import_id`)
        REFERENCES `gtfs_feed_imports` (`id`)
        ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `gtfs_calendar` (
    `feed_import_id` BIGINT UNSIGNED NOT NULL,
    `service_id` VARCHAR(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
    `monday` TINYINT(1) NOT NULL,
    `tuesday` TINYINT(1) NOT NULL,
    `wednesday` TINYINT(1) NOT NULL,
    `thursday` TINYINT(1) NOT NULL,
    `friday` TINYINT(1) NOT NULL,
    `saturday` TINYINT(1) NOT NULL,
    `sunday` TINYINT(1) NOT NULL,
    `start_date` CHAR(8) NOT NULL,
    `end_date` CHAR(8) NOT NULL,
    UNIQUE KEY `uq_calendar_import_service` (`feed_import_id`, `service_id`),
    CONSTRAINT `fk_gtfs_calendar_feed_import`
        FOREIGN KEY (`feed_import_id`)
        REFERENCES `gtfs_feed_imports` (`id`)
        ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `gtfs_calendar_dates` (
    `feed_import_id` BIGINT UNSIGNED NOT NULL,
    `service_id` VARCHAR(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
    `date` CHAR(8) NOT NULL,
    `exception_type` TINYINT UNSIGNED NOT NULL,
    UNIQUE KEY `uq_calendar_dates_import` (`feed_import_id`, `service_id`, `date`),
    CONSTRAINT `fk_gtfs_calendar_dates_feed_import`
        FOREIGN KEY (`feed_import_id`)
        REFERENCES `gtfs_feed_imports` (`id`)
        ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `gtfs_shapes` (
    `feed_import_id` BIGINT UNSIGNED NOT NULL,
    `shape_id` VARCHAR(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
    `shape_pt_lat` DECIMAL(10,7) NOT NULL,
    `shape_pt_lon` DECIMAL(10,7) NOT NULL,
    `shape_pt_sequence` INT UNSIGNED NOT NULL,
    `shape_dist_traveled` DECIMAL(14,3) NULL,
    UNIQUE KEY `uq_shapes_import_sequence` (`feed_import_id`, `shape_id`, `shape_pt_sequence`),
    KEY `idx_shapes_import_shape` (`feed_import_id`, `shape_id`),
    CONSTRAINT `fk_gtfs_shapes_feed_import`
        FOREIGN KEY (`feed_import_id`)
        REFERENCES `gtfs_feed_imports` (`id`)
        ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `gtfs_feed_info` (
    `feed_import_id` BIGINT UNSIGNED NOT NULL,
    `feed_publisher_name` VARCHAR(500) NULL,
    `feed_publisher_url` VARCHAR(2048) NULL,
    `feed_lang` VARCHAR(64) NULL,
    `feed_start_date` CHAR(8) NULL,
    `feed_end_date` CHAR(8) NULL,
    `feed_version` VARCHAR(255) NULL,
    `feed_contact_email` VARCHAR(500) NULL,
    `feed_contact_url` VARCHAR(2048) NULL,
    KEY `idx_feed_info_import` (`feed_import_id`),
    CONSTRAINT `fk_gtfs_feed_info_feed_import`
        FOREIGN KEY (`feed_import_id`)
        REFERENCES `gtfs_feed_imports` (`id`)
        ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `gtfs_frequencies` (
    `feed_import_id` BIGINT UNSIGNED NOT NULL,
    `trip_id` VARCHAR(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
    `start_time` VARCHAR(32) NOT NULL,
    `end_time` VARCHAR(32) NOT NULL,
    `headway_secs` INT UNSIGNED NOT NULL,
    `exact_times` TINYINT UNSIGNED NULL,
    KEY `idx_frequencies_import_trip` (`feed_import_id`, `trip_id`),
    CONSTRAINT `fk_gtfs_frequencies_feed_import`
        FOREIGN KEY (`feed_import_id`)
        REFERENCES `gtfs_feed_imports` (`id`)
        ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `gtfs_transfers` (
    `feed_import_id` BIGINT UNSIGNED NOT NULL,
    `from_stop_id` VARCHAR(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
    `to_stop_id` VARCHAR(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
    `transfer_type` TINYINT UNSIGNED NULL,
    `min_transfer_time` INT UNSIGNED NULL,
    KEY `idx_transfers_import_from` (`feed_import_id`, `from_stop_id`),
    KEY `idx_transfers_import_to` (`feed_import_id`, `to_stop_id`),
    CONSTRAINT `fk_gtfs_transfers_feed_import`
        FOREIGN KEY (`feed_import_id`)
        REFERENCES `gtfs_feed_imports` (`id`)
        ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;