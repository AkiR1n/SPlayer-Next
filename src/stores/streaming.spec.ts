import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Track } from "@shared/types/player";
import type { StreamingFavoriteChange } from "@shared/types/streaming";
const state = vi.hoisted(() => ({
  media: { track: null as Track | null, setTrack: vi.fn() },
  queue: { value: [] as Track[] },
  updateQueue: vi.fn(),
  favoriteChanged: null as ((change: StreamingFavoriteChange) => void) | null,
  getFavorite: vi.fn(),
  setFavorite: vi.fn(),
  snapshot: vi.fn(),
  unsubscribe: vi.fn(),
  load: vi.fn(),
}));
vi.mock("@/stores/media", () => ({ useMediaStore: () => state.media }));
vi.mock("@/stores/queue", () => ({
  queue: state.queue,
  updateQueueTracks: state.updateQueue,
  removeServerTracks: vi.fn(),
}));
import { useStreamingStore } from "./streaming";
const track: Track = {
  id: "server:song",
  originalId: "song",
  serverId: "server",
  source: "streaming",
  title: "歌曲",
  artists: [],
  duration: 10000,
  favorite: false,
};
beforeEach(() => {
  setActivePinia(createPinia());
  vi.clearAllMocks();
  state.media.track = track;
  state.queue.value = [track];
  state.media.setTrack.mockImplementation((value) => {
    state.media.track = value;
  });
  state.getFavorite.mockReset().mockResolvedValue(true);
  state.setFavorite.mockReset().mockResolvedValue(false);
  state.snapshot.mockReset().mockResolvedValue({
    songs: [{ ...track, favorite: true }],
    albums: [],
    artists: [],
    playlists: [],
  });
  state.load.mockReset().mockResolvedValue({
    servers: [
      {
        id: "server",
        name: "测试",
        type: "navidrome",
        url: "https://server",
        username: "user",
        hasPassword: true,
      },
    ],
    activeServerId: null,
  });
  Object.assign(window, {
    api: {
      streaming: {
        loadServers: state.load,
        getFavorite: state.getFavorite,
        setFavorite: state.setFavorite,
        getSnapshot: state.snapshot,
        sync: vi.fn(async () => false),
        onFavoriteChanged: (callback: (change: StreamingFavoriteChange) => void) => {
          state.favoriteChanged = callback;
          return state.unsubscribe;
        },
        onSyncState: () => state.unsubscribe,
        onLibraryUpdated: () => state.unsubscribe,
      },
    },
  });
});

describe("流媒体收藏与快照状态", () => {
  it("迟到快照不能覆盖请求期间已确认的收藏操作", async () => {
    const store = useStreamingStore();
    await store.init();
    store.activeServerId = "server";
    let finish!: (snapshot: unknown) => void;
    state.snapshot.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const refresh = store.refreshLibrary(true);
    state.favoriteChanged!({ serverId: "server", trackId: "song", favorite: true });
    finish({ songs: [track], albums: [], artists: [], playlists: [] });
    await refresh;
    expect(store.songs[0].favorite).toBe(true);
    expect(store.isFavorite(track)).toBe(true);
    expect(state.media.track?.favorite).toBe(true);
    expect(state.updateQueue).toHaveBeenLastCalledWith([{ ...track, favorite: true }]);
    state.snapshot.mockResolvedValueOnce({
      songs: [track],
      albums: [],
      artists: [],
      playlists: [],
    });
    await store.refreshLibrary(true);
    expect(store.isFavorite(store.songs[0])).toBe(false);
  });
  it("切换收藏先读取服务端状态，不能直接反转旧队列状态", async () => {
    const store = useStreamingStore();
    expect(await store.toggleFavorite(track)).toBe(false);
    expect(state.setFavorite).toHaveBeenCalledExactlyOnceWith("server", "song", false);
    expect(state.media.track?.favorite).toBe(false);
    expect(state.updateQueue).toHaveBeenLastCalledWith([{ ...track, favorite: false }]);
  });

  it("重复点击只产生一次收藏写入", async () => {
    const store = useStreamingStore();
    const first = store.toggleFavorite(track);
    expect(await store.toggleFavorite(track)).toBeNull();
    await first;
    expect(state.setFavorite).toHaveBeenCalledOnce();
  });

  it("单曲变更更新当前歌曲与队列，并保持不同服务器的 ID 隔离", async () => {
    const store = useStreamingStore();
    await store.init();
    state.favoriteChanged!({ serverId: "other", trackId: "song", favorite: true });
    expect(store.isFavorite(track)).toBe(false);
    state.favoriteChanged!({ serverId: "server", trackId: "song", favorite: true });
    expect(store.isFavorite(track)).toBe(true);
    expect(state.media.track?.favorite).toBe(true);
  });

  it("刷新快照接受其他客户端的收藏变更", async () => {
    const store = useStreamingStore();
    await store.init();
    state.favoriteChanged!({ serverId: "server", trackId: "song", favorite: false });
    store.activeServerId = "server";
    await store.refreshLibrary(true);
    expect(store.isFavorite(store.songs[0])).toBe(true);
    expect(state.media.track?.favorite).toBe(true);
  });

  it("并发初始化共享配置读取，销毁 store 时释放事件订阅", async () => {
    const store = useStreamingStore();
    await Promise.all([store.init(), store.init()]);
    expect(state.load).toHaveBeenCalledOnce();
    store.$dispose();
    expect(state.unsubscribe).toHaveBeenCalledTimes(3);
  });
});
