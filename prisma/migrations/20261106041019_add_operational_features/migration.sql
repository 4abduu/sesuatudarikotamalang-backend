-- AlterTable
ALTER TABLE `app_settings` ADD COLUMN `defaultCreatorSharePercent` DECIMAL(5, 2) NOT NULL DEFAULT 70,
    ADD COLUMN `lowStockThreshold` INTEGER NOT NULL DEFAULT 5,
    ADD COLUMN `weeklyOffDays` JSON NULL,
    ADD COLUMN `weeklyOffEnabled` BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE `artisans` ADD COLUMN `creatorSharePercent` DECIMAL(5, 2) NULL;

-- AlterTable
ALTER TABLE `notifications` MODIFY `type` ENUM('pengajuan_diterima', 'pengajuan_ditolak', 'ulasan_baru', 'pesanan_update', 'umum', 'stok_menipis', 'produk_mendekati_batas', 'produk_ditarik', 'produk_disetujui', 'produk_ditolak', 'produk_disembunyikan', 'libur_terdampak', 'laporan_final') NOT NULL DEFAULT 'umum';

-- AlterTable
ALTER TABLE `orders` ADD COLUMN `completedAt` DATETIME(3) NULL;

-- AlterTable
ALTER TABLE `products` ADD COLUMN `approvalStatus` ENUM('menunggu', 'disetujui', 'ditolak') NOT NULL DEFAULT 'disetujui',
    ADD COLUMN `lowStockNotifiedAt` DATETIME(3) NULL,
    ADD COLUMN `replacesProductId` VARCHAR(191) NULL,
    ADD COLUMN `slowWarnedAt` DATETIME(3) NULL,
    ADD COLUMN `statusNote` VARCHAR(300) NULL,
    ADD COLUMN `withdrawnAt` DATETIME(3) NULL;

-- CreateTable
CREATE TABLE `pickup_holidays` (
    `id` VARCHAR(191) NOT NULL,
    `startDate` DATE NOT NULL,
    `endDate` DATE NOT NULL,
    `reason` VARCHAR(120) NOT NULL,
    `createdById` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `pickup_holidays_startDate_endDate_idx`(`startDate`, `endDate`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `stock_movements` (
    `id` VARCHAR(191) NOT NULL,
    `productId` VARCHAR(191) NOT NULL,
    `variantId` VARCHAR(191) NULL,
    `delta` INTEGER NOT NULL,
    `stockAfter` INTEGER NOT NULL,
    `reason` ENUM('barang_masuk', 'opname', 'terjual_kasir', 'rusak_hilang', 'koreksi', 'pesanan') NOT NULL,
    `note` VARCHAR(200) NULL,
    `actorId` VARCHAR(191) NULL,
    `orderId` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `stock_movements_productId_createdAt_idx`(`productId`, `createdAt`),
    INDEX `stock_movements_createdAt_idx`(`createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `monthly_reports` (
    `month` VARCHAR(7) NOT NULL,
    `status` ENUM('draf', 'final') NOT NULL DEFAULT 'draf',
    `finalizedAt` DATETIME(3) NULL,
    `finalizedById` VARCHAR(191) NULL,
    `snapshot` JSON NULL,
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`month`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `stock_movements` ADD CONSTRAINT `stock_movements_productId_fkey` FOREIGN KEY (`productId`) REFERENCES `products`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `stock_movements` ADD CONSTRAINT `stock_movements_variantId_fkey` FOREIGN KEY (`variantId`) REFERENCES `product_variants`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `stock_movements` ADD CONSTRAINT `stock_movements_orderId_fkey` FOREIGN KEY (`orderId`) REFERENCES `orders`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
