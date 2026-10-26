-- AlterTable
ALTER TABLE `app_settings` ADD COLUMN `pickupCloseTime` VARCHAR(5) NOT NULL DEFAULT '23:00',
    ADD COLUMN `pickupLeadMinutes` INTEGER NOT NULL DEFAULT 30,
    ADD COLUMN `pickupOpenTime` VARCHAR(5) NOT NULL DEFAULT '09:00';

-- CreateTable
CREATE TABLE `pickup_slots` (
    `id` VARCHAR(191) NOT NULL,
    `time` VARCHAR(5) NOT NULL,
    `capacity` INTEGER NOT NULL DEFAULT 3,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `pickup_slots_time_key`(`time`),
    INDEX `pickup_slots_isActive_idx`(`isActive`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Isi awal: 10 slot, kapasitas 3. Dipilih agar mencakup 5 slot lama (10:00, 11:00, 13:00, 15:00, 17:00).
INSERT INTO `pickup_slots` (`id`, `time`, `capacity`, `isActive`, `createdAt`, `updatedAt`) VALUES
  (UUID(), '10:00', 3, true, NOW(3), NOW(3)),
  (UUID(), '11:00', 3, true, NOW(3), NOW(3)),
  (UUID(), '12:00', 3, true, NOW(3), NOW(3)),
  (UUID(), '13:00', 3, true, NOW(3), NOW(3)),
  (UUID(), '14:00', 3, true, NOW(3), NOW(3)),
  (UUID(), '15:00', 3, true, NOW(3), NOW(3)),
  (UUID(), '16:00', 3, true, NOW(3), NOW(3)),
  (UUID(), '17:00', 3, true, NOW(3), NOW(3)),
  (UUID(), '18:00', 3, true, NOW(3), NOW(3)),
  (UUID(), '19:00', 3, true, NOW(3), NOW(3));

