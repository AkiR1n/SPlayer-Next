/**
 * Host API 主进程侧实现
 *
 * 当 sandbox 收到 worker 的 hostCall 消息，调用本模块的 dispatch()，
 * dispatch 根据 method 去做真实工作（网络/存储），再通过 sandbox.sendHostResult 回传。
 */

import type { HostCallMethod, HostRequestOptions, PluginGrant } from "@shared/types/plugin";
import { PluginErrorCodes } from "@shared/defaults/plugin-api";
import { pluginHost } from "./host-process";
import { hostRequest } from "./net";
import {
  pluginStorageGet,
  pluginStorageKeys,
  pluginStorageRemove,
  pluginStorageSet,
} from "./storage";
import { playerControl } from "@main/services/playerControl";
import { z } from "zod/v4";
import { searchOnline, searchLibrary, trackSchema } from "@main/services/music";
import { callPlatformApi } from "@main/services/platformApi";
import { Notification } from "electron";
import * as nowPlaying from "@main/services/nowPlaying";
import type { OnlineSearchOptions } from "@shared/types/music";

const AUTH_RESPONSE_FIELDS = new Set([
  "cookie",
  "cookies",
  "setcookie",
  "authorization",
  "token",
  "accesstoken",
  "refreshtoken",
  "idtoken",
  "viptoken",
  "musicu",
  "musica",
  "musickey",
  "skey",
  "pskey",
  "pt4token",
  "sessionkey",
]);

/** 处理一次 plugin→host 调用 */
export const dispatchHostCall = async (
  pluginId: string,
  getGrants: () => PluginGrant[],
  callId: string,
  method: HostCallMethod,
  args: unknown[],
  isActive: () => boolean = () => true,
  pluginName = pluginId,
): Promise<void> => {
  try {
    if (!isActive()) return;
    // 权限门控
    const requiredGrant =
      method === "request" || method === "music.searchOnline"
        ? "network"
        : method === "music.searchLibrary"
          ? "library"
          : method === "api.call"
            ? "api"
            : method === "notify"
              ? "ui"
              : method.startsWith("player.")
                ? "control"
                : undefined;
    const checkPermission = (): void => {
      if (requiredGrant && !getGrants().includes(requiredGrant)) {
        throw Object.assign(new Error(`plugin "${pluginId}" lacks "${requiredGrant}" grant`), {
          code: PluginErrorCodes.PERMISSION_DENIED,
        });
      }
    };
    checkPermission();
    let data: unknown;
    switch (method) {
      case "request":
        data = await hostRequest(args[0] as string, (args[1] ?? {}) as HostRequestOptions);
        break;
      case "storage.get":
        data = pluginStorageGet(pluginId, args[0] as string);
        break;
      case "storage.set":
        pluginStorageSet(pluginId, args[0] as string, args[1]);
        data = undefined;
        break;
      case "storage.remove":
        pluginStorageRemove(pluginId, args[0] as string);
        data = undefined;
        break;
      case "storage.keys":
        data = pluginStorageKeys(pluginId);
        break;
      case "player.play":
        playerControl.play();
        data = undefined;
        break;
      case "player.pause":
        playerControl.pause();
        data = undefined;
        break;
      case "player.next":
        playerControl.next();
        data = undefined;
        break;
      case "player.prev":
        playerControl.prev();
        data = undefined;
        break;
      case "player.seek": {
        const positionMs = Number(args[0]);
        // 插件侧即发即忘：吞掉引擎 rejection，不阻塞 hostCall 返回
        if (Number.isFinite(positionMs) && positionMs >= 0) {
          void playerControl.seek(positionMs).catch(() => {});
        }
        data = undefined;
        break;
      }
      case "player.setVolume": {
        const volume = Number(args[0]);
        if (Number.isFinite(volume) && volume >= 0 && volume <= 1) playerControl.setVolume(volume);
        data = undefined;
        break;
      }
      case "player.getPosition":
        data = playerControl.getPosition();
        break;
      case "player.stop":
        playerControl.stop();
        break;
      case "player.getStatus":
        data = playerControl.getStatus();
        break;
      case "player.getNowPlaying":
        data = nowPlaying.lightSnapshot();
        break;
      case "player.playTrack": {
        const track = trackSchema.parse(args[0]);
        playerControl.playTrack(track);
        data = { id: track.id, source: track.source };
        break;
      }
      case "player.addToQueue": {
        const tracks = z.array(trackSchema).min(1).max(50).parse(args[0]);
        const position = z.enum(["next", "end"]).parse(args[1] ?? "next");
        playerControl.addToQueue(tracks, position);
        data = { count: tracks.length };
        break;
      }
      case "player.setPlayMode": {
        const mode = z
          .strictObject({
            repeat: z.enum(["list", "one"]).optional(),
            shuffle: z.enum(["on", "off"]).optional(),
          })
          .refine((value) => value.repeat || value.shuffle, "Empty play mode")
          .parse(args[0]);
        if (mode.repeat) playerControl.setRepeat(mode.repeat);
        if (mode.shuffle) playerControl.setShuffle(mode.shuffle);
        break;
      }
      case "music.searchOnline":
        data = await searchOnline(args[0] as OnlineSearchOptions);
        break;
      case "music.searchLibrary":
        data = searchLibrary(args[0] as string, args[1] as number | undefined);
        break;
      case "api.call": {
        const platform = z.enum(["netease", "qqmusic", "kugou"]).parse(args[0]);
        const name = z.string().min(1).max(256).parse(args[1]);
        const params = z.record(z.string(), z.unknown()).parse(args[2] ?? {});
        // 业务接口完整复用，但不能把宿主登录态发送到插件指定的服务器。
        for (const key of ["cookie", "domain", "proxy", "headers"]) {
          if (Object.hasOwn(params, key)) throw new Error(`Host API does not accept ${key}`);
        }
        // 只在插件边界剥离认证凭据，界面调用仍接收原始响应。
        const omitCredentials = (value: unknown): unknown => {
          if (Array.isArray(value)) return value.map(omitCredentials);
          if (value === null || typeof value !== "object") return value;
          return Object.fromEntries(
            Object.entries(value)
              .filter(([key]) => !AUTH_RESPONSE_FIELDS.has(key.replace(/[-_]/g, "").toLowerCase()))
              .map(([key, item]) => [key, omitCredentials(item)]),
          );
        };
        data = omitCredentials(await callPlatformApi(platform, name, params));
        break;
      }
      case "notify": {
        const message = z.string().trim().min(1).max(1000).parse(args[0]);
        if (!Notification.isSupported()) throw new Error("System notifications are unavailable");
        new Notification({ title: pluginName, body: message }).show();
        break;
      }
      default:
        throw Object.assign(new Error(`unknown host method: ${method}`), {
          code: PluginErrorCodes.UNKNOWN,
        });
    }
    if (!isActive()) return;
    checkPermission();
    pluginHost.sendHostResult(pluginId, callId, true, data);
  } catch (err) {
    if (!isActive()) return;
    pluginHost.sendHostResult(pluginId, callId, false, undefined, {
      code: ((err as any)?.code as string) ?? PluginErrorCodes.UNKNOWN,
      message: err instanceof Error ? err.message : String(err),
    });
  }
};
