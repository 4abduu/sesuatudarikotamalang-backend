-- AddColumn brandKey ke tabel artisans (nullable, unique)
-- Nullable agar data lama tetap valid; backfill dilakukan lewat scripts/backfill_brand_key.js
ALTER TABLE `artisans` ADD COLUMN `brandKey` VARCHAR(191) NULL;

-- Unique index (MySQL mengizinkan multiple NULL pada unique index)
CREATE UNIQUE INDEX `artisans_brandKey_key` ON `artisans`(`brandKey`);
