-- Link olshop per produk (3 marketplace x mode tidak/toko/khusus) + pengaturan toko & halaman Tentang Kami

-- AlterTable: products
ALTER TABLE `products`
    MODIFY `shopeeUrl` VARCHAR(500) NULL,
    ADD COLUMN `shopeeMode` ENUM('tidak', 'toko', 'khusus') NOT NULL DEFAULT 'tidak',
    ADD COLUMN `tokopediaMode` ENUM('tidak', 'toko', 'khusus') NOT NULL DEFAULT 'tidak',
    ADD COLUMN `tokopediaUrl` VARCHAR(500) NULL,
    ADD COLUMN `tiktokshopMode` ENUM('tidak', 'toko', 'khusus') NOT NULL DEFAULT 'tidak',
    ADD COLUMN `tiktokshopUrl` VARCHAR(500) NULL;

-- Data lama: produk yang sudah punya shopeeUrl dianggap "link khusus"
UPDATE `products` SET `shopeeMode` = 'khusus' WHERE `shopeeUrl` IS NOT NULL AND `shopeeUrl` <> '';

-- AlterTable: app_settings
ALTER TABLE `app_settings`
    ADD COLUMN `contactEmail` VARCHAR(191) NULL,
    ADD COLUMN `aboutDescription` TEXT NULL,
    ADD COLUMN `shopeeStoreUrl` VARCHAR(500) NULL,
    ADD COLUMN `tokopediaStoreUrl` VARCHAR(500) NULL,
    ADD COLUMN `tiktokshopStoreUrl` VARCHAR(500) NULL;
