-- CreateTable
CREATE TABLE `resource_slots` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `resource_id` INTEGER NOT NULL,
    `slot_date` DATE NOT NULL,
    `start_at` DATETIME(3) NOT NULL,
    `end_at` DATETIME(3) NOT NULL,
    `status` ENUM('AVAILABLE', 'BOOKED', 'BLOCKED') NOT NULL DEFAULT 'AVAILABLE',
    `version` INTEGER NOT NULL DEFAULT 0,

    INDEX `idx_resource_slots_date_status`(`resource_id`, `slot_date`, `status`),
    UNIQUE INDEX `uk_resource_start`(`resource_id`, `start_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `resource_slots` ADD CONSTRAINT `resource_slots_resource_id_fkey` FOREIGN KEY (`resource_id`) REFERENCES `resources`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
