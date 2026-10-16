-- CreateTable
CREATE TABLE `resource_rules` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `resource_id` INTEGER NOT NULL,
    `weekday` TINYINT UNSIGNED NOT NULL,
    `start_time` TIME(0) NOT NULL,
    `end_time` TIME(0) NOT NULL,
    `slot_minutes` SMALLINT UNSIGNED NOT NULL,
    `effective_from` DATE NOT NULL,
    `effective_to` DATE NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `idx_resource_rules_resource_weekday`(`resource_id`, `weekday`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `resource_rules` ADD CONSTRAINT `resource_rules_resource_id_fkey` FOREIGN KEY (`resource_id`) REFERENCES `resources`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
