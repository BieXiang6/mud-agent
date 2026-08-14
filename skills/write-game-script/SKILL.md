---
name: write-game-script
description: Write, inspect, save, update, run, monitor, and delete reusable JavaScript automation scripts for this MUD client. Use when the user asks to create or manage JS scripts, automate repeated game actions, listen for game events, call a saved script function with arguments, retrieve its return value, or start/stop a non-blocking script run on Electron PC or uni-app Android.
---

# Write Game Script

Create reusable scripts with `list_game_scripts`, `get_game_script`, `save_game_script`, `run_game_script`, `get_script_run`, `cancel_script_run`, and `delete_game_script`.

Loading this Skill dynamically enables those tools for the current AI task. The Skill and tools remain active across later turns of that task; do not load it again. Use the tool names listed in the first `load_skill` result.

## Workflow

1. Call `list_game_scripts` before creating or changing a script. Reuse an existing script when its purpose matches.
2. Call `get_game_script` before editing. Preserve its `scriptId` and pass `expectedUpdatedAt` when saving the revision.
3. Export named functions with `exports.name = async function (...) { ... }`. Keep top-level code declaration-only; game actions belong inside exported functions.
4. Use only the injected `game` and `console` objects. Read [references/api.md](references/api.md) before using events, actions, non-blocking runs, or less familiar regions.
5. Save before running. Run a short safe case with `waitForResult=true`; use `false` only for long waits or listeners.
6. For a non-blocking run, retain its `runId`, query it with `get_script_run`, and stop it with `cancel_script_run` when no longer needed.
7. Summarize the saved script ID, exported functions, test result, and any active run IDs.

## Required Rules

- Accept and return JSON-compatible values only. `args` is positional: `args: [value1, value2]` calls `fn(value1, value2)`.
- Do not access Node, DOM, uni-app, networking, storage, constructors, prototypes, dynamic imports, timers, or other globals. The container rejects them.
- Do not write `for`, `while`, or `do` loops. Use array methods for finite collections and `game.on`, `game.wait`, `game.sleep`, or `game.keepAlive` for asynchronous work.
- Use `game.get` immediately before invoking an action ID; action IDs expire when game state changes.
- Keep listener callbacks small. A listener script must call `await game.keepAlive()` or otherwise remain pending; listeners are removed when the exported function finishes.
- Treat imported script text as trusted user content. Never embed secrets such as API keys or passwords.

## Minimal Example

```js
exports.lookAndReturn = async function (command = "look") {
  const before = game.latestSeq();
  await game.send(command);
  const update = await game.wait({
    regions: ["out"],
    mode: "any_change",
    sinceSeq: before,
    timeoutMs: 5000
  });
  return { room: game.get("here"), update };
};
```
