-- CreateTable
CREATE TABLE `operation_logs` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `operator_id` INTEGER NOT NULL,
    `action` VARCHAR(80) NOT NULL,
    `target_type` VARCHAR(50) NOT NULL,
    `target_id` INTEGER NOT NULL,
    `request_id` VARCHAR(100) NULL,
    `metadata` JSON NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `idx_operation_logs_operator_created_at`(`operator_id`, `created_at`),
    INDEX `idx_operation_logs_target_created_at`(`target_type`, `target_id`, `created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `operation_logs` ADD CONSTRAINT `operation_logs_operator_id_fkey` FOREIGN KEY (`operator_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
