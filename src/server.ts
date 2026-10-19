import app from "./app";
import { startOrderStatusJob } from "./jobs/orderStatusJob";
import { startTokenCleanupJob } from "./jobs/tokenCleanupJob";

const PORT = process.env.PORT || 4000;

app.listen(PORT, () => {
  console.log(`Server jalan di http://localhost:${PORT}`);
  startOrderStatusJob();
  startTokenCleanupJob();
});
