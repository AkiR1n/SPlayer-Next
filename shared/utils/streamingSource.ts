import type { Track } from "../types/player";

/**
 * 生成不含凭据的音源身份，播放、缓存和下载共用
 * @param track - 流媒体歌曲
 * @returns 主进程解析的音源占位符
 */
export const streamingSourceForTrack = (track: Track): string => {
  if (track.source !== "streaming" || !track.serverId || !track.originalId)
    throw new Error("流媒体歌曲缺少服务器身份");
  return `streaming://${encodeURIComponent(track.serverId)}/${encodeURIComponent(track.originalId)}`;
};

/**
 * 解析主进程接收的音源身份
 * @param source - 不含凭据的占位符
 * @returns 所属服务器与原始歌曲 ID
 */
export const parseStreamingSource = (source: string): { serverId: string; trackId: string } => {
  const url = new URL(source);
  if (
    url.protocol !== "streaming:" ||
    !url.hostname ||
    !url.pathname.slice(1) ||
    url.search ||
    url.hash ||
    url.username ||
    url.password
  )
    throw new Error("无效的流媒体音源身份");
  return {
    serverId: decodeURIComponent(url.hostname),
    trackId: decodeURIComponent(url.pathname.slice(1)),
  };
};
