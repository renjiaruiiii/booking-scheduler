-- CreateTable
CREATE TABLE `outbox_events` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `event_type` VARCHAR(100) NOT NULL,
    `aggregate_type` VARCHAR(50) NOT NULL,
    `aggregate_id` INTEGER NOT NULL,
    `payload` JSON NOT NULL,
    `status` ENUM('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED') NOT NULL DEFAULT 'PENDING',
    `retry_count` INTEGER UNSIGNED NOT NULL DEFAULT 0,
    `next_retry_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `idx_outbox_events_status_retry_at`(`status`, `next_retry_at`),
    INDEX `idx_outbox_events_aggregate`(`aggregate_type`, `aggregate_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
