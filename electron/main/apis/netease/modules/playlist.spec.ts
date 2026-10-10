import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../core/checktoken", () => ({ getAntiCheatTokenV3: vi.fn() }));
vi.mock("../core/device", () => ({ getAnonymousToken: () => "", getDeviceId: () => "device" }));
vi.mock("@main/utils/proxy", () => ({ fetchWithProxy: vi.fn() }));

import { NeteaseRequestError } from "../core/request";
import playlistTracks from "./playlist_tracks";
import playlistSubscribe from "./playlist_subscribe";

const response = { status: 200, body: { code: 200 }, cookie: [] };
const request = vi.fn();

describe("歌单接口兼容", () => {
  beforeEach(() => request.mockReset().mockResolvedValue(response));

  it("保留受限歌曲 512 的双倍 ID 添加重试", async () => {
    request.mockRejectedValueOnce(
      new NeteaseRequestError({ status: 512, body: { code: "512" }, cookie: [] }),
    );
    expect(await playlistTracks({ op: "add", pid: 1, tracks: "2,3" }, request)).toBe(response);
    expect(request).toHaveBeenCalledTimes(2);
    expect(request.mock.calls[1][1].trackIds).toBe('["2","3","2","3"]');
  });

  for (const code of [301, 302, 401, 502]) {
    it(`业务 ${code} 原样返回，不触发受限歌曲重试`, async () => {
      const error = new NeteaseRequestError({ status: code, body: { code }, cookie: [] });
      request.mockRejectedValueOnce(error);
      await expect(playlistTracks({ op: "add", pid: 1, tracks: "2" }, request)).rejects.toBe(error);
      expect(request).toHaveBeenCalledTimes(1);
    });
  }

  it("删除歌曲遇到 512 不重复写入", async () => {
    request.mockRejectedValueOnce(
      new NeteaseRequestError({ status: 512, body: { code: 512 }, cookie: [] }),
    );
    await expect(playlistTracks({ op: "del", pid: 1, tracks: "2" }, request)).rejects.toThrow();
    expect(request).toHaveBeenCalledTimes(1);
  });

  it("收藏保持原有 eapi 请求，不强制获取反作弊凭据", async () => {
    await playlistSubscribe({ id: 1, t: "1" }, request);
    expect(request.mock.calls[0][0]).toBe("/api/playlist/subscribe");
    expect(request.mock.calls[0][1]).toEqual({ id: 1 });
    expect(request.mock.calls[0][2].crypto).toBe("eapi");
    expect(request.mock.calls[0][2].checkToken).toBe(false);
  });

  it("字符串取消参数使用取消接口，不携带收藏业务 token", async () => {
    await playlistSubscribe({ id: 1, t: "2" }, request);
    expect(request.mock.calls[0][0]).toBe("/api/playlist/unsubscribe");
    expect(request.mock.calls[0][1]).toEqual({ id: 1 });
  });
});
