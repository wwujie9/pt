import { createInternalAdapter } from "./internal-adapter.js";
import { createRssAdapter } from "./rss-adapter.js";
import { createTorznabAdapter } from "./torznab-adapter.js";

export function createAdapter(source) {
  if (source.type === "internal") return createInternalAdapter(source);
  if (source.type === "rss") return createRssAdapter(source);
  if (source.type === "torznab") return createTorznabAdapter(source);

  throw new Error(`不支持的来源类型：${source.type}`);
}
