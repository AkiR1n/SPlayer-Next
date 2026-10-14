# Source resolution

Register source capabilities to provide playback URLs, lyrics, covers, or comments. HTTP requests, storage, and utilities are covered in [Common APIs](/en/plugins/api).

## Request flow

The host selects a plugin for the track source and calls its registered action handler. Playback URL resolution follows the user's plugin priority; the first valid result is used.

Playback URLs use fixed source keys. Metadata capabilities can also use custom keys.

| Track platform identifier | Source key |
| ------------------------- | ---------- |
| `netease`                 | `wy`       |
| `qqmusic`                 | `tx`       |
| `kugou`                   | `kg`       |

## Quick start

```js
/**
 * @name Example source
 * @id you.example-source
 * @version 1.0.0
 * @apiLevel 1
 */
splayer.register({
  sources: {
    wy: { name: "Example source", actions: ["musicUrl"], qualities: ["hq"] },
  },
});
splayer.on("musicUrl", async ({ musicInfo, quality }) => {
  const response = await splayer.request(
    "https://api.example.com/url?id=" + encodeURIComponent(musicInfo.songmid) + "&q=" + quality,
    { responseType: "json" },
  );
  if (!response.body?.url) throw new Error("No playback URL");
  return { url: response.body.url, quality };
});
```

Replace the example endpoint with your service. Save as a `.js` file and import it through Plugin Management.

## Source registration {#register}

Declares source capabilities during initialization.

**Call:** `splayer.register(args)`

**API version:** 1

**Permission:** None

**Parameter:** `args.sources: Record<string, SourceCapability>`. Keys identify sources; each value contains:

| Field       | Type                    | Description                                         |
| ----------- | ----------------------- | --------------------------------------------------- |
| `name`      | `string`                | Required display name                               |
| `actions`   | `PluginAction[]`        | Required; choose from [supported actions](#actions) |
| `qualities` | [Quality[]](#qualities) | Optional supported qualities                        |

**Returns:** `void`. Multiple sources share each action handler; dispatch using the request's `source`.

### Supported actions {#actions}

Register a matching handler with `splayer.on` for each action.

| Action                          | Purpose           | Minimum level |
| ------------------------------- | ----------------- | ------------- |
| [`musicUrl`](#musicurl)         | Playback URL      | 1             |
| [`musicSearch`](#musicsearch)   | Search candidates | 1             |
| [`musicLyric`](#musiclyric)     | Fetch lyrics      | 1             |
| [`musicPic`](#musicpic)         | Fetch covers      | 1             |
| [`musicComment`](#musiccomment) | Fetch comments    | 3             |

### Quality levels {#qualities}

| `Quality`  | Meaning                                                               |
| ---------- | --------------------------------------------------------------------- |
| `hi-res`   | High-resolution lossless, sample rate ≥ 96 kHz and bit depth ≥ 24 bit |
| `lossless` | Lossless                                                              |
| `hq`       | Lossy, bitrate ≥ 320 kbps                                             |
| `sq`       | Lossy, bitrate ≥ 192 kbps                                             |
| `lq`       | Lossy, bitrate < 192 kbps                                             |

## Source resolution {#resolution}

Register handlers with `splayer.on(action, handler)`, which returns `void`. `action` is the action name; `handler: (req) => Promise<res>` receives a host request and returns a result. Registering the same action again replaces its handler. Registration requires no permission; methods called inside a handler retain their own requirements.

`musicUrl` has a 20-second timeout; other source actions have 15 seconds. Throw when no result is available; the host can try another plugin.

### Playback URL {#musicurl}

Provides a playable URL.

**Call:** `splayer.on("musicUrl", handler)`

**API version:** 1

**Permission:** None

**Parameters:**

- `source` (`string`): Requested source key
- `quality` (`Quality`): Requested quality
- `musicInfo` (`object`): Track information below

| `musicInfo` field           | Type             | Description                                  |
| --------------------------- | ---------------- | -------------------------------------------- |
| `songmid` / `id` / `songId` | `string`         | Aliases for the platform track ID            |
| `name`                      | `string`         | Title                                        |
| `singer`                    | `string`         | Artist names joined with `/`                 |
| `source`                    | `string`         | Source key                                   |
| `interval`                  | `string \| null` | Duration as `mm:ss`, or `null`               |
| `img`                       | `string \| null` | Cover URL                                    |
| `hash`                      | `string`         | Optional track hash for sources that use one |
| `albumId` / `albumName`     | `string`         | Album ID / name, empty when unknown          |
| `meta`                      | `object`         | Additional album, cover, and other metadata  |

| Result field | Type      | Description                                       |
| ------------ | --------- | ------------------------------------------------- |
| `url`        | `string`  | Required non-empty playback URL                   |
| `quality`    | `Quality` | Optional actual quality                           |
| `expire`     | `number`  | Optional URL expiration timestamp in milliseconds |

See [Quick start](#quick-start) for a call example. If the requested quality is unavailable, return a lower quality and identify it in `quality`.

## Metadata extensions {#metadata-fallback}

### Matching flow {#matching}

Register `musicSearch` and any of `musicLyric`, `musicPic`, or `musicComment`. The host matches candidates by title, artist, album, and duration, then passes the selected candidate as `musicInfo`. A matching platform can use its track ID directly and skip search.

Lyrics fall back to plugins after built-in providers or the streaming server. Cover fallback runs only when a track has no cover. Comment sources appear in the comments view and require both `musicSearch` and `musicComment`.

::: tip Candidate duration
Provide `durationMs` when available. Candidates differing by more than 20 seconds are excluded when both durations are available.
:::

```js
splayer.register({
  sources: {
    custom: { name: "Example", actions: ["musicSearch", "musicLyric", "musicPic", "musicComment"] },
  },
});
```

### Search candidates {#musicsearch}

Searches metadata candidates for host matching.

**Call:** `splayer.on("musicSearch", handler)`

**API version:** 1

**Permission:** None

**Parameters:**

- `source` (`string`): Source key
- `keyword` (`string`): Search text, usually title and artist
- `page` (`number`): Optional page number
- `limit` (`number`): Optional requested candidate count

**Result:** `{ list: Candidate[] }`, using an empty list when nothing matches.

| `Candidate` field | Type     | Description                                                         |
| ----------------- | -------- | ------------------------------------------------------------------- |
| `id`              | `string` | Required source track ID                                            |
| `name`            | `string` | Required title                                                      |
| `singer`          | `string` | Optional artist                                                     |
| `album`           | `string` | Optional album                                                      |
| `durationMs`      | `number` | Optional duration in milliseconds, used to reject incorrect matches |
| Other fields      | Any      | Passed unchanged to subsequent handlers                             |

```js
splayer.on("musicSearch", async ({ keyword, page = 1, limit = 20 }) => {
  const query = new URLSearchParams({ keyword, page: String(page), limit: String(limit) });
  const { body } = await splayer.request("https://api.example.com/search?" + query, {
    responseType: "json",
  });
  return {
    list: body.songs.map((song) => ({
      id: String(song.id),
      name: song.title,
      singer: song.artist,
      album: song.album,
      durationMs: song.durationMs,
    })),
  };
});
```

### Fetch lyrics {#musiclyric}

Returns lyrics for the matched candidate.

**Call:** `splayer.on("musicLyric", handler)`

**API version:** 1

**Permission:** None

**Parameters:**

- `source` (`string`): Source key.
- `musicInfo` (`Candidate`): Matched candidate.

| Result field | Type     | Description                                      |
| ------------ | -------- | ------------------------------------------------ |
| `lyric`      | `string` | Required main lyrics, LRC or line text           |
| `tlyric`     | `string` | Optional translation                             |
| `rlyric`     | `string` | Optional romanization                            |
| `awlyric`    | `string` | Optional word-timed lyrics, format auto-detected |

Word-timed `awlyric` takes precedence. The host tries other sources when no usable lyrics are returned.

```js
splayer.on("musicLyric", async ({ musicInfo }) => {
  const { body } = await splayer.request(
    "https://api.example.com/lyric?id=" + encodeURIComponent(musicInfo.id),
    { responseType: "json" },
  );
  return { lyric: body.lyric ?? "", tlyric: body.translation };
});
```

### Fetch covers {#musicpic}

Returns the matched candidate's cover.

**Call:** `splayer.on("musicPic", handler)`

**API version:** 1

**Permission:** None

**Parameters:**

- `source` (`string`): Source key.
- `musicInfo` (`Candidate`): Matched candidate.

**Result:** `{ url: string }`, a direct remote image URL; an empty URL means no result.

```js
splayer.on("musicPic", async ({ musicInfo }) => {
  const { body } = await splayer.request(
    "https://api.example.com/cover?id=" + encodeURIComponent(musicInfo.id),
    { responseType: "json" },
  );
  return { url: body.url ?? "" };
});
```

### Fetch comments {#musiccomment}

Returns a page of comments for the matched candidate.

**Call:** `splayer.on("musicComment", handler)`

**API version:** 3

**Permission:** None

**Parameters:**

- `source` (`string`): Source key
- `musicInfo` (`Candidate`): Matched candidate
- `type` (`"hot" | "new"`): Popular or latest comments
- `page` (`number`): Page number, starting at 1
- `limit` (`number`): Page size

**Result:** `{ list: Comment[]; total: number; page: number; limit: number }`, containing the current page, total count, page number, and page size.

| `Comment` field     | Type        | Description                            |
| ------------------- | ----------- | -------------------------------------- |
| `id`                | `string`    | Required comment ID                    |
| `userName`          | `string`    | Required user name                     |
| `text`              | `string`    | Required content                       |
| `userId` / `avatar` | `string`    | Optional user ID / avatar URL          |
| `time`              | `number`    | Optional timestamp in milliseconds     |
| `location`          | `string`    | Optional location                      |
| `likedCount`        | `number`    | Optional like count                    |
| `images`            | `string[]`  | Optional image URLs                    |
| `reply`             | `Comment[]` | Optional reply summaries               |
| `replyTotal`        | `number`    | Optional total reply count             |
| `hasMoreReply`      | `boolean`   | Optional indication of further replies |

```js
splayer.on("musicComment", async ({ musicInfo, type, page, limit }) => {
  const query = new URLSearchParams({
    id: musicInfo.id,
    type,
    page: String(page),
    limit: String(limit),
  });
  const { body } = await splayer.request("https://api.example.com/comments?" + query, {
    responseType: "json",
  });
  return {
    list: body.comments.map((comment) => ({
      id: String(comment.id),
      userName: comment.userName,
      text: comment.text,
    })),
    total: body.total,
    page,
    limit,
  };
});
```

## Updates and compatibility

See [Plugin Updates](/en/plugins/update) for releases and [LX Compatibility](/en/plugins/lx) for existing LX scripts.
