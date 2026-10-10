/**
 * 订阅 / 取消订阅歌单
 *
 * params:
 * - id  歌单 id
 * - t   1 订阅 / 2 取消，默认 1
 *
 * 响应：`{ code }`
 */

import { createOption } from "../core/option";
import type { NeteaseModule } from "../core/types";

const playlistSubscribe: NeteaseModule = (query, request) => {
  const action = Number(query.t ?? 1) === 2 ? "unsubscribe" : "subscribe";
  return request(`/api/playlist/${action}`, { id: query.id }, createOption(query, "eapi"));
};

export default playlistSubscribe;
