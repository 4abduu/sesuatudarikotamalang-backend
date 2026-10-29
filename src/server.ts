import app from "./app";
import { startOrderStatusJob } from "./jobs/orderStatusJob";
import { startTokenCleanupJob } from "./jobs/tokenCleanupJob";
import { startUploadCleanupJob } from "./jobs/uploadCleanupJob";

const PORT = process.env.PORT || 4000;

app.listen(PORT, () => {
  console.log(`Server jalan di http://localhost:${PORT}`);
  startOrderStatusJob();
  startTokenCleanupJob();
  startUploadCleanupJob();
});
