import { z } from "zod/v4";
import { searchTracks } from "@main/database";
import type { Track } from "@shared/types/player";
import type { OnlineSearchOptions, OnlineSearchResult } from "@shared/types/music";
import { searchOnlineTracks } from "./onlineSearch";

/** 校验播放必需字段，保留路径、平台附加 ID 等 Track 信息 */
export const trackSchema = z.looseObject({
  id: z.string().min(1),
  source: z.enum(["local", "streaming", "netease", "qqmusic", "kugou"]),
  title: z.string(),
  artists: z.array(z.looseObject({ name: z.string() })),
  duration: z.number().finite().nonnegative(),
}) satisfies z.ZodType<Track>;

export const onlineSearchSchema = z.strictObject({
  platform: z.enum(["netease", "qqmusic", "kugou"]),
  query: z.string().trim().min(1).max(200),
  page: z.number().int().min(1).max(100).default(1),
  limit: z.number().int().min(1).max(50).default(20),
});

/**
 * 插件与 MCP 共用的在线搜索入口
 * @param options - 平台与分页搜索参数
 * @returns 统一歌曲列表
 */
export const searchOnline = (options: OnlineSearchOptions): Promise<OnlineSearchResult> => {
  const { platform, query, page, limit } = onlineSearchSchema.parse(options);
  return searchOnlineTracks(platform, query, page, limit);
};

/**
 * 搜索本地曲库，返回完整 Track
 * @param query - 关键词
 * @param limit - 返回上限
 * @returns 搜索总数与轻量曲目
 */
export const searchLibrary = (query: string, limit = 20): { total: number; tracks: Track[] } => {
  const input = z
    .strictObject({
      query: z.string().trim().min(1).max(200),
      limit: z.number().int().min(1).max(100),
    })
    .parse({ query, limit });
  const matches = searchTracks(input.query);
  const tracks = matches.slice(0, input.limit);
  return { total: matches.length, tracks };
};
