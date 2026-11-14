-- CreateIndex
CREATE INDEX `reviews_productId_createdAt_idx` ON `reviews`(`productId`, `createdAt`);

-- CreateIndex
CREATE INDEX `reviews_productId_rating_createdAt_idx` ON `reviews`(`productId`, `rating`, `createdAt`);
