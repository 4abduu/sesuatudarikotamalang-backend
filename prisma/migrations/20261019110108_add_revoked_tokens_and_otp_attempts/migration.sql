-- AlterTable
ALTER TABLE `otp_codes` ADD COLUMN `attempts` INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE `revoked_tokens` (
    `tokenHash` CHAR(64) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `expiresAt` DATETIME(3) NOT NULL,
    `revokedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `revoked_tokens_expiresAt_idx`(`expiresAt`),
    PRIMARY KEY (`tokenHash`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
