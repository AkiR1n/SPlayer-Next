import { withStreamingAdapter } from "./connection";
import type { StreamingPlaybackSource } from "./adapters/types";

/**
 * 在主进程解析音频源，单纯解析不产生播放上报
 * @param serverId - 服务器 ID
 * @param trackId - 服务端歌曲 ID
 * @param sessionId - 播放或下载上下文 ID
 * @param signal - 取消信号
 * @returns 已鉴权音频源
 */
export const resolveStreamingMediaSource = (
  serverId: string,
  trackId: string,
  sessionId: string,
  signal?: AbortSignal,
): Promise<StreamingPlaybackSource> =>
  withStreamingAdapter(
    serverId,
    (config, adapter) => adapter.preparePlayback(config, trackId, sessionId),
    signal,
  );
