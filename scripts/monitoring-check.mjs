import { db } from "../server/services/db.js";
import { runMonitoringCheck } from "../server/services/monitoring.js";

try {
  const snapshot = await runMonitoringCheck();
  console.log(JSON.stringify(snapshot, null, 2));
  await db.close?.();
  if (!snapshot.ok && process.env.MONITORING_FAIL_ON_ALERT !== "0") process.exit(1);
} catch (error) {
  await db.close?.();
  console.error(error.message);
  process.exit(1);
}
