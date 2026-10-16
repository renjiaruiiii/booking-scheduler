-- CreateTable
CREATE TABLE `resource_unavailable_dates` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `resource_id` INTEGER NOT NULL,
    `date` DATE NOT NULL,
    `reason` VARCHAR(255) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `uk_resource_unavailable_date`(`resource_id`, `date`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `resource_unavailable_dates` ADD CONSTRAINT `resource_unavailable_dates_resource_id_fkey` FOREIGN KEY (`resource_id`) REFERENCES `resources`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
