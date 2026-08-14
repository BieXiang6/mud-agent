# Script container API

Scripts run in a restricted cross-platform container shared by Electron PC and uni-app Android. Export functions through `exports`; do not rely on browser, Node, uni-app, or module imports.

## Function contract

```js
exports.functionName = async function (firstArg, secondArg) {
  return { ok: true, firstArg, secondArg };
};
```

`run_game_script.args` is a JSON array of positional arguments. The function return value, API values, and logs must be JSON-compatible. A run can end as `queued`, `running`, `completed`, `failed`, `cancelled`, or `timed_out`.

## Regions

`all`, `out`, `chat`, `dialog`, `exits`, `here`, `long`, `gameobj`, `actions`, `tmenu`, `mycmds`, and `status`.

Snapshots from actionable regions contain `action.id` values. Read the region again before calling `game.invoke` because IDs are revision-bound.

## Read APIs

- `game.get(region = "all", limit = 50)`: return the current region snapshot.
- `game.events(options = {})`: return journal entries. Options: `sinceSeq`, `sinceTime`, `regions`, and `limit`.
- `game.latestSeq()`: return the latest journal sequence number.
- `await game.wait(options)`: wait for a new event. Options: `regions`, `sinceSeq`, `timeoutMs`, `mode` (`match` or `any_change`), `pattern`, and `flags`.

## Action APIs

- `await game.send(command, options = {})`: send one command or newline-separated commands. `options.expectedRevision` prevents stale writes. The user's command blacklist still applies.
- `await game.invoke(actionId, text = "")`: invoke a current UI action. Supply `text` for a dialog input action.

## Async and listener APIs

- `await game.sleep(ms)`: non-blocking delay, capped at 60 seconds per call.
- `game.on(regions, async event => { ... })`: subscribe to new journal events in one region or an array of regions. Returns an unsubscribe function.
- `await game.keepAlive()`: keep a listener function alive until its run is cancelled or times out.
- `game.log(...values)` / `console.log(...)`: append bounded diagnostic logs shown by `get_script_run`.

Listener example:

```js
exports.watchChat = async function (keyword) {
  game.on(["chat"], event => {
    if (event.text.includes(keyword)) game.log("matched", event.text);
  });
  await game.keepAlive();
};
```

Start this function with `waitForResult=false`, then query or cancel it by `runId`.

## Container limits

- Up to 50 saved scripts and 40,000 source characters per script.
- Up to 20 positional arguments, 100 log entries, 100,000 serialized return characters, and a 10-minute run timeout.
- No synchronous loop statements, global runtime access, network/storage APIs, prototype or constructor access, dynamic imports, `eval`, `Function`, Web Workers, or direct timers.
- Listeners exist only for the lifetime of one function run and are always cleaned up afterward.
