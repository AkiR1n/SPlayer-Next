# Plugin API Levels

## Choosing a level {#choosing}

The current host API level is **4**. `@apiLevel` declares the minimum level required by a plugin; `splayer.apiLevel` reports the running host's level. Higher levels include earlier capabilities. A requirement above the host level fails with `PLUGIN_API_LEVEL_MISMATCH`.

`@version` and `@changelog` describe an individual plugin's releases; see [Plugin updates](/en/plugins/update).

## Capability history {#history}

| Level | Introduced capabilities                                                                                                                                                                                             |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1     | Source registration; `musicUrl`, `musicSearch`, `musicLyric`, `musicPic` handlers; `request`, `storage`, `log`, `getSetting`, and `utils`                                                                           |
| 2     | Playback control; playback event subscriptions; `play`, `pause`, `next`, `prev`, `seek`, `setVolume`, `getPosition`; settings declarations and `onSettingChange`; track menus and `menuClick`                       |
| 3     | `musicComment` handler for paginated comments                                                                                                                                                                       |
| 4     | `music.searchOnline`, `music.searchLibrary`; `player.playTrack`, `addToQueue`, `stop`, `setPlayMode`, `getStatus`, `getNowPlaying`; `api.call`, `notify`; `library` and `api` permissions, user-managed permissions |
