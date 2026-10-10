import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { neteaseCall } from "@/apis/netease";

const cache = vi.hoisted(() => ({
  getItem: vi.fn(async () => null),
  setItem: vi.fn(async () => undefined),
}));

vi.mock("localforage", () => ({
  default: { createInstance: () => cache },
}));

import { useUserStore } from "./user";

const profile = { userId: 1, nickname: "测试用户" };
const song = (id: number) => ({ id, name: String(id), ar: [], al: { id: 0 }, dt: 1000 });
const playlist = { id: 10, name: "我喜欢的音乐", creator: profile };

describe("网易云用户会话与喜欢列表", () => {
  const call = vi.fn();
  const clearSession = vi.fn(async () => undefined);
  let bodies: Record<string, Record<string, unknown>>;

  beforeEach(() => {
    setActivePinia(createPinia());
    cache.getItem.mockReset().mockResolvedValue(null);
    cache.setItem.mockClear();
    clearSession.mockClear();
    bodies = {
      login_status: { data: { code: 200, account: { id: 1 }, profile } },
      login_refresh: { code: 200 },
      user_subcount: { code: 200, createdPlaylistCount: 1 },
      user_playlist: { code: 200, playlist: [playlist] },
      likelist: { code: 200, ids: [1, 2] },
      album_sublist: { code: 200, data: [] },
      artist_sublist: { code: 200, data: [] },
      user_level: { code: 200, data: { level: 1 } },
      playlist_detail: {
        code: 200,
        playlist: { ...playlist, trackIds: [{ id: 1 }, { id: 2 }], tracks: [song(1)] },
      },
      song_detail: { code: 200, songs: [] },
      like_v1: { code: 200 },
    };
    call.mockReset().mockImplementation(async (_platform, name) => ({
      ok: true,
      status: 200,
      body: bodies[name],
    }));
    Object.defineProperty(window, "api", {
      configurable: true,
      value: { apis: { call, clearSession } },
    });
  });

  const loggedInStore = () => {
    const store = useUserStore();
    store.profile = { ...profile };
    store.lastRefreshAt = Date.now();
    return store;
  };

  it("传输层成功包装的登录失效仍然立即清除账号", async () => {
    const store = loggedInStore();
    bodies.user_subcount = { code: 302, msg: "需要登录" };

    await expect(neteaseCall("user_subcount")).rejects.toThrow();

    expect(store.isLoggedIn).toBe(false);
    expect(clearSession).toHaveBeenCalledWith("netease");
    expect(call.mock.calls.some(([, name]) => name === "login_status")).toBe(false);
  });

  it("登录状态查询业务 502 保留离线资料", async () => {
    const store = loggedInStore();
    bodies.login_status = { code: 502, msg: "服务暂时不可用" };

    expect(await store.fetchStatus()).toBe(true);
    expect(store.profile?.userId).toBe(1);
    expect(clearSession).not.toHaveBeenCalled();
  });

  it("游客账号会清掉持久化的旧登录标记", async () => {
    const store = loggedInStore();
    bodies.login_status = { data: { code: 200, account: { anonimous: true }, profile: null } };

    expect(await store.fetchStatus()).toBe(false);
    expect(store.isLoggedIn).toBe(false);
  });

  it("退出后返回的旧内容请求不会恢复收藏", async () => {
    const store = loggedInStore();
    let finish!: (value: unknown) => void;
    const pending = new Promise((resolve) => {
      finish = resolve;
    });
    const implementation = call.getMockImplementation()!;
    call.mockImplementation((platform, name, params) =>
      name === "album_sublist" ? pending : implementation(platform, name, params),
    );
    const loading = store.loadContent(1);
    await vi.waitFor(() =>
      expect(call.mock.calls.some(([, name]) => name === "album_sublist")).toBe(true),
    );

    await store.invalidateSession();
    finish({ ok: true, status: 200, body: { code: 200, data: [{ id: 99, name: "旧专辑" }] } });
    await loading;

    expect(store.profile).toBeNull();
    expect(store.albums).toEqual([]);
    expect(store.playlists).toEqual([]);
    expect(store.likedSongIds.size).toBe(0);
  });

  it("歌曲详情缺失不会被当成取消红心", async () => {
    const store = loggedInStore();
    await store.loadContent(1);
    await store.ensureLikedPlaylist();

    expect([...store.likedSongIds]).toEqual(["1", "2"]);
    expect(store.likedPlaylistTracks.map(({ id }) => id)).toEqual(["1"]);
    call.mockClear();
    await store.ensureLikedPlaylist();
    expect(call.mock.calls.filter(([, name]) => name === "playlist_detail")).toHaveLength(0);
  });

  it("再次进入喜欢页会发现外部新增的红心", async () => {
    const store = loggedInStore();
    await store.loadContent(1);
    await store.ensureLikedPlaylist();
    bodies.likelist = { code: 200, ids: [1, 2, 3] };
    bodies.playlist_detail = {
      code: 200,
      playlist: {
        ...playlist,
        trackIds: [{ id: 3 }, { id: 1 }, { id: 2 }],
        tracks: [song(3), song(1)],
      },
    };

    await store.ensureLikedPlaylist();

    expect(store.isLiked("3")).toBe(true);
    expect(store.likedPlaylistTracks.map(({ id }) => id)).toEqual(["3", "1"]);
  });

  it("强制刷新失败时保留原有喜欢曲目", async () => {
    const store = loggedInStore();
    await store.loadContent(1);
    await store.ensureLikedPlaylist();
    bodies.playlist_detail = { code: 502, msg: "网关错误" };

    await store.ensureLikedPlaylist(true);

    expect(store.likedPlaylistTracks.map(({ id }) => id)).toEqual(["1"]);
    expect([...store.likedSongIds]).toEqual(["1", "2"]);
    expect(store.likedPlaylistLoading).toBe(false);
  });

  it("后台旧红心响应不会覆盖刚完成的操作", async () => {
    const store = loggedInStore();
    let finish!: (value: unknown) => void;
    const pending = new Promise((resolve) => {
      finish = resolve;
    });
    const implementation = call.getMockImplementation()!;
    call.mockImplementation((platform, name, params) =>
      name === "likelist" ? pending : implementation(platform, name, params),
    );
    const loading = store.loadContent(1);
    await vi.waitFor(() =>
      expect(call.mock.calls.some(([, name]) => name === "likelist")).toBe(true),
    );

    expect(await store.toggleLike("3")).toBe(true);
    finish({ ok: true, status: 200, body: { code: 200, ids: [1, 2] } });
    await loading;

    expect(store.isLiked("3")).toBe(true);
  });

  it("连续触发喜欢同步只发送一组请求", async () => {
    const store = loggedInStore();
    await store.loadContent(1);
    call.mockClear();

    await Promise.all([store.ensureLikedPlaylist(), store.ensureLikedPlaylist()]);

    expect(call.mock.calls.filter(([, name]) => name === "likelist")).toHaveLength(1);
    expect(call.mock.calls.filter(([, name]) => name === "playlist_detail")).toHaveLength(1);
  });
});
