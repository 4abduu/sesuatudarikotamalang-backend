-- AlterTable
ALTER TABLE `artisan_applications` ADD COLUMN `samplePhotos` JSON NULL;

-- AlterTable
ALTER TABLE `categories` ADD COLUMN `blurb` VARCHAR(191) NULL,
    ADD COLUMN `iconName` VARCHAR(191) NULL,
    ADD COLUMN `sortOrder` INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE `product_stories` ADD COLUMN `process` TEXT NULL;
