import type { Platform } from "./platform";
import type { Track, PlayerState, RepeatMode, ShuffleMode } from "./player";

export interface PlaybackStatusSnapshot {
  state: PlayerState;
  positionMs: number;
  durationMs: number;
  volume: number;
  isFinished: boolean;
  repeat: RepeatMode;
  shuffle: ShuffleMode;
}

export interface OnlineSearchOptions {
  platform: Platform;
  query: string;
  page?: number;
  limit?: number;
}

export interface OnlineSearchResult {
  platform: Platform;
  page: number;
  total: number;
  hasMore: boolean;
  tracks: Track[];
}
