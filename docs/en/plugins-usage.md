# Using Plugins

Plugins can extend **music sources** (resolve playable track URLs) and **control** (react to playback and control the player). This page is for plugin users. Authors should start with [Plugin Development](/en/plugins/).

## Opening plugin management

Open **Settings → Plugin Management**. Each installed plugin card shows its name, version, author, runtime state, and supported sources.

## Installing a plugin

- **Plugin market:** Choose a plugin in the market and select Install.
- **Local import:** Select a `.js` file.
- **Import from URL:** Paste an HTTPS URL to a `.js` file, such as a GitHub or Gitee raw URL.

For LX and compressed script support, see [LX Compatibility](/en/plugins/lx).

## Enable, disable, and uninstall

- Newly installed plugins are enabled automatically.
- Multiple plugins may be enabled at once. If several support the same source, SPlayer-Next selects one by priority.
- A plugin can expose settings from its plugin card.
- **Uninstalling deletes the script and its local data and cannot be undone.**

States are **Ready**, **Loading**, **Error** (with a reason), and **Disabled**.

## Details and permissions

Click an installed plugin card to open its details. Under Permissions, turn each requested permission on or off:

| Permission       | What it allows                                                                                                              |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Network          | Request external network services                                                                                           |
| Playback control | Play, pause, switch tracks, and change the queue                                                                            |
| UI extensions    | Add menus and send system notifications                                                                                     |
| Library access   | Search the local music library                                                                                              |
| Platform APIs    | Use the app’s current platform sessions to call APIs, including account actions such as liking tracks and editing playlists |

Declared permissions are enabled by default. Turn them off in the details dialog; plugin updates preserve your choices.

## Troubleshooting

**Why is the plugin in Error state?**  
Read the error shown on its card. Common causes are syntax/runtime errors or an API level newer than the installed app supports.

**Can a plugin crash the app?**  
Plugins run in a separate host process. The app attempts to restart it after a crash; other plugins may be temporarily unavailable during recovery.

**Why are plugin requests slow?**  
Plugin network requests follow the system proxy. Performance depends on the destination and network conditions.
