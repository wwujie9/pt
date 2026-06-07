import { claimNextTask, completeTask, failTask } from "./services/downloads.js";
import { appendAuditLog } from "./services/audit.js";
import { db } from "./services/db.js";

const workerId = process.env.WORKER_ID || `worker-${Date.now().toString(36)}`;
const intervalMs = Number(process.env.WORKER_INTERVAL_MS || 3000);

console.log(`PT Resource Hub worker started: ${workerId}`);

async function tick() {
  const task = await claimNextTask(workerId);
  if (!task) return;
  try {
    // 这里先完成队列状态机；真实下载器协议可在此按 clientId/resourceId 分派。
    const result = {
      queuedAt: task.createdAt,
      workerId,
      message: "任务已由 worker 接收，等待下载器协议适配执行",
    };
    await completeTask(task.id, result);
    await appendAuditLog({
      workspaceId: task.workspaceId || "default",
      action: "task.completed",
      targetType: "task",
      targetId: task.id,
      payload: result,
    });
  } catch (error) {
    await failTask(task.id, error);
    await appendAuditLog({
      workspaceId: task.workspaceId || "default",
      action: "task.failed",
      targetType: "task",
      targetId: task.id,
      payload: { message: error.message },
    });
  }
}

if (process.env.WORKER_RUN_ONCE === "1") {
  await tick();
  await db.close?.();
} else {
  setInterval(() => tick().catch((error) => console.error(error)), intervalMs).unref();
  await tick();
}
