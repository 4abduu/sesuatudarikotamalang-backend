-- AlterTable
ALTER TABLE `app_settings` ADD COLUMN `refundWindowDays` INTEGER NOT NULL DEFAULT 3,
    MODIFY `holdDurationMinutes` INTEGER NOT NULL DEFAULT 1440;

-- AlterTable
ALTER TABLE `artisans` ADD COLUMN `isOfficial` BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE `orders` ADD COLUMN `cancelReason` ENUM('permintaan_pembeli', 'kesalahan_toko') NULL,
    ADD COLUMN `refundStatus` ENUM('tidak_ada', 'menunggu', 'selesai') NOT NULL DEFAULT 'tidak_ada',
    ADD COLUMN `refundedAt` DATETIME(3) NULL;

-- CreateIndex
CREATE INDEX `artisans_isOfficial_idx` ON `artisans`(`isOfficial`);

-- CreateIndex
CREATE INDEX `orders_refundStatus_idx` ON `orders`(`refundStatus`);
