-- CreateTable
CREATE TABLE `bookings` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `booking_no` VARCHAR(50) NOT NULL,
    `user_id` INTEGER NOT NULL,
    `resource_id` INTEGER NOT NULL,
    `status` ENUM('PENDING', 'CONFIRMED', 'CANCELLED', 'REJECTED', 'COMPLETED') NOT NULL DEFAULT 'PENDING',
    `remark` TEXT NULL,
    `idempotency_key` VARCHAR(100) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `bookings_booking_no_key`(`booking_no`),
    INDEX `idx_bookings_user_status_created_at`(`user_id`, `status`, `created_at`),
    INDEX `idx_bookings_resource_status_created_at`(`resource_id`, `status`, `created_at`),
    UNIQUE INDEX `uk_bookings_user_idempotency`(`user_id`, `idempotency_key`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `booking_slots` (
    `booking_id` INTEGER NOT NULL,
    `slot_id` INTEGER NOT NULL,

    UNIQUE INDEX `uk_booking_slot_slot`(`slot_id`),
    PRIMARY KEY (`booking_id`, `slot_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `bookings` ADD CONSTRAINT `bookings_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `bookings` ADD CONSTRAINT `bookings_resource_id_fkey` FOREIGN KEY (`resource_id`) REFERENCES `resources`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `booking_slots` ADD CONSTRAINT `booking_slots_booking_id_fkey` FOREIGN KEY (`booking_id`) REFERENCES `bookings`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `booking_slots` ADD CONSTRAINT `booking_slots_slot_id_fkey` FOREIGN KEY (`slot_id`) REFERENCES `resource_slots`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
