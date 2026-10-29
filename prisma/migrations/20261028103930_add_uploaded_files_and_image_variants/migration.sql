-- AlterTable
ALTER TABLE `products` ADD COLUMN `imageVariants` JSON NULL;

-- CreateTable
CREATE TABLE `uploaded_files` (
    `id` VARCHAR(191) NOT NULL,
    `publicId` VARCHAR(191) NOT NULL,
    `resourceType` VARCHAR(20) NOT NULL,
    `url` VARCHAR(500) NOT NULL,
    `mimetype` VARCHAR(100) NOT NULL,
    `size` INTEGER NOT NULL,
    `uploadedById` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `uploaded_files_publicId_key`(`publicId`),
    INDEX `uploaded_files_uploadedById_idx`(`uploadedById`),
    INDEX `uploaded_files_createdAt_idx`(`createdAt`),
    INDEX `uploaded_files_url_idx`(`url`(191)),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `uploaded_files` ADD CONSTRAINT `uploaded_files_uploadedById_fkey` FOREIGN KEY (`uploadedById`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
