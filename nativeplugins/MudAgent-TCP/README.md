# MudAgent-TCP

Android uni-app native module. The socket connect and blocking read run on a
dedicated Java thread. Incoming bytes are decoded as GBK or UTF-8 in Java and delivered
to JavaScript as text chunks, so the JS runtime never polls `available()` or
copies one byte at a time across the bridge.

The generated `android/libs/mudagent-tcp.jar` is the local plugin artifact and
is intentionally excluded from Git. Build it with `build-tcp-plugin.ps1` after
cloning the project and rebuild it after changing the Java source. A custom
debug base or cloud build that includes local native plugins is required; the
standard HBuilderX base does not contain this module.

Multi-account builds use `connectSession(id, host, port, timeoutMs, encoding, callback)`,
`sendSession(id, text, callback)` and `closeSession(id)`. Up to five independent
connections retain their own reader, writer, encoding and generation. Rebuild the
JAR and the custom base after updating. Older single-socket plugins fall back to
independent Native.js sockets so connecting another account cannot replace an
existing native connection.
