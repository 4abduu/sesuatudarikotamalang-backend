import app from "./app";
import { startOrderStatusJob } from "./jobs/orderStatusJob";
import { startTokenCleanupJob } from "./jobs/tokenCleanupJob";
import { startUploadCleanupJob } from "./jobs/uploadCleanupJob";
import { startSlowMoverJob } from "./jobs/slowMoverJob";
import { logger } from "./logger";

const PORT = process.env.PORT || 4000;

app.listen(PORT, () => {
  logger.info({ port: PORT, nodeEnv: process.env.NODE_ENV ?? "tidak diset" }, "server berjalan");
  startOrderStatusJob();
  startTokenCleanupJob();
  startUploadCleanupJob();
  startSlowMoverJob();
});
