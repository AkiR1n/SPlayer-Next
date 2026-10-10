import { beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({
  likelist: vi.fn(),
  search: vi.fn(),
  login_refresh: vi.fn(),
  getSessionCookies: vi.fn(() => ({ MUSIC_U: "test-session" })),
  saveSessionCookies: vi.fn(),
  clearSessionCookies: vi.fn(),
}));

vi.mock("@main/database/sessions", () => api);
vi.mock("@main/store", () => ({ store: { get: () => false } }));
vi.mock("@main/utils/logger", () => ({ neteaseLog: { info: vi.fn() } }));
vi.mock("./core/request", () => ({ createRequest: vi.fn() }));
vi.mock("./core/xeapi", () => ({ resetXeapiKey: vi.fn() }));
vi.mock("./core/device", () => ({
  getAnonymousToken: () => "",
  getDeviceId: () => "test-device",
  setAnonymousToken: vi.fn(),
  setDeviceId: vi.fn(),
}));
vi.mock("./modules", () => ({
  modules: {
    likelist: api.likelist,
    search: api.search,
    login_refresh: api.login_refresh,
  },
}));

import { callNetease, clearNeteaseCookies, setNeteaseCookies } from "./index";

const response = (code: number, cookie: string[] = []) => ({
  status: 200,
  body: { code, ids: [1] },
  cookie,
});

describe("网易云主进程缓存与会话", () => {
  beforeEach(() => {
    setNeteaseCookies({ MUSIC_U: "test-session" });
    api.saveSessionCookies.mockClear();
    api.clearSessionCookies.mockClear();
    api.likelist.mockReset().mockResolvedValue(response(200));
    api.search.mockReset().mockResolvedValue(response(200));
    api.login_refresh.mockReset().mockResolvedValue(response(200));
  });

  it("红心列表每次从服务端读取", async () => {
    await callNetease("likelist", { uid: 1 });
    await callNetease("likelist", { uid: 1 });

    expect(api.likelist).toHaveBeenCalledTimes(2);
  });

  it("业务 502 不会因为包装状态为 200 而被缓存", async () => {
    api.search.mockResolvedValue(response(502));

    await callNetease("search", { keywords: "test" });
    await callNetease("search", { keywords: "test" });

    expect(api.search).toHaveBeenCalledTimes(2);
  });

  it("正常公开响应仍然采用有界缓存", async () => {
    await callNetease("search", { keywords: "test" });
    await callNetease("search", { keywords: "test" });

    expect(api.search).toHaveBeenCalledTimes(1);
  });

  it("登出后的旧续期响应不能恢复 MUSIC_U", async () => {
    let finish!: (value: ReturnType<typeof response>) => void;
    api.login_refresh.mockReturnValue(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    const pending = callNetease("login_refresh");

    clearNeteaseCookies();
    finish(response(200, ["MUSIC_U=old-session; Path=/"]));
    await pending;

    expect(api.saveSessionCookies).not.toHaveBeenCalled();
    expect(api.clearSessionCookies).toHaveBeenCalledWith("netease");
  });

  it("切换账号后的旧公开响应不会进入新账号缓存", async () => {
    let finish!: (value: ReturnType<typeof response>) => void;
    api.search.mockReturnValueOnce(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    const pending = callNetease("search", { keywords: "test" });
    await vi.waitFor(() => expect(api.search).toHaveBeenCalledTimes(1));

    setNeteaseCookies({ MUSIC_U: "new-session" });
    finish(response(200));
    await pending;
    await callNetease("search", { keywords: "test" });

    expect(api.search).toHaveBeenCalledTimes(2);
  });
});
