---
name: write-game-script
description: Write, inspect, save, update, run, monitor, and delete reusable JavaScript automation scripts for this MUD client. Use when the user asks to create or manage JS scripts, automate repeated game actions, listen for game events, call a saved script function with arguments, retrieve its return value, or start/stop a non-blocking script run on Electron PC or uni-app Android.
---

# Write Game Script

Create reusable scripts with `list_game_scripts`, `get_game_script`, `edit_game_script`, `save_game_script`, `run_game_script`, `get_script_run`, `cancel_script_run`, and `delete_game_script`.

Loading this Skill dynamically enables those tools for the current AI task. The Skill and tools remain active across later turns of that task; do not load it again. Use the tool names listed in the first `load_skill` result.

## Workflow

1. Call `list_game_scripts` before creating or changing a script. Reuse an existing script when its purpose matches.
2. Call `get_game_script` before editing. Preserve its `id` and use the returned `updatedAt` as `expectedUpdatedAt`. Prefer `edit_game_script` for existing code; reserve `save_game_script` for creation or intentional full rewrites. Use `startLine`/`endLine` for partial reads and `lineNumbers=true` for a numbered view. Never copy display line numbers into edits.
3. Export named functions with `exports.name = async function (...) { ... }`. Keep top-level code declaration-only; game actions belong inside exported functions.
4. Use only the injected `game` and `console` objects. Read [references/api.md](references/api.md) before using events, actions, non-blocking runs, or less familiar regions.
5. Save before running. Run a short safe case with `waitForResult=true`; use `false` only for long waits or listeners.
6. For a non-blocking run, retain its `runId`, query it with `get_script_run`, and stop it with `cancel_script_run` when no longer needed.
7. Summarize the saved script ID, exported functions, test result, and any active run IDs.

## Local editing

`edit_game_script` saves a batch of 1–50 edits atomically and returns metadata, the new `updatedAt`, and change summaries without echoing all source. It checks script restrictions and JavaScript syntax without executing the script. Other fields (name, description, ID) are preserved.

- Text edits: `{oldText, newText}` matches exact whitespace and must match once. Include surrounding code to disambiguate repeated text. Empty `newText` deletes the match; empty `oldText` is forbidden in text mode.
- Line edits: `{startLine, endLine, oldText, newText}` replaces complete lines, with 1-based inclusive bounds. `oldText` must exactly match those lines, excluding the newline after the final selected line. Empty `newText` deletes the selected lines. To insert before line N, use `startLine: N, endLine: N-1, oldText: ""`; N may be totalLines+1 to append. Line-mode `newText` is a block of complete lines; one final newline is optional.
- Edits run in array order against the intermediate result. Later line numbers must account for earlier insertions/deletions; use bottom-to-top ordering when using original line numbers for disjoint edits.
- On a version conflict, missing/ambiguous match, bad line range, or validation error, nothing is saved. Re-read the relevant region and retry with its current version; do not fall back to overwriting the full source.
- After success, use the returned `saved.updatedAt` for the next batch. Read only the affected region if verification needs source.

Example: `edit_game_script({scriptId: "script-…", expectedUpdatedAt: 123, edits: [{oldText: "await game.sleep(1000);", newText: "await game.sleep(2000);"}]})`.

## Runtime rules

- Accept and return JSON-compatible values only. `args` is positional: `args: [value1, value2]` calls `fn(value1, value2)`.
- Do not access Node, DOM, uni-app, networking, storage, constructors, prototypes, dynamic imports, timers, or other globals. The container rejects them.
- Do not write `for`, `while`, or `do` loops. Use array methods for finite collections and `game.on`, `game.wait`, `game.sleep`, or `game.keepAlive` for asynchronous work.
- Use `game.get` immediately before invoking an action ID; action IDs expire when game state changes.
- Keep listener callbacks small. A listener script must call `await game.keepAlive()` or otherwise remain pending; listeners are removed when the exported function finishes.
- Script runs do not time out automatically. Always retain the `runId` for long-lived non-blocking runs and cancel them when they are no longer needed.
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
