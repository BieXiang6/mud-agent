package com.mudagent.tcp;

import android.os.Handler;
import android.os.Looper;

import java.io.BufferedInputStream;
import java.io.IOException;
import java.io.InputStreamReader;
import java.io.OutputStreamWriter;
import java.net.InetSocketAddress;
import java.net.Socket;
import java.nio.charset.Charset;
import java.util.HashMap;
import java.util.Map;

import io.dcloud.feature.uniapp.annotation.UniJSMethod;
import io.dcloud.feature.uniapp.bridge.UniJSCallback;
import io.dcloud.feature.uniapp.common.UniModule;

/**
 * Long-lived TCP client for the MUD connection.
 *
 * The reader never calls into JavaScript while blocked in Socket.read(). It
 * decodes a received chunk on this worker and posts only the completed String
 * callback to the main looper.
 */
public class MudTcpModule extends UniModule {
    private static final Charset GBK = Charset.forName("GBK");
    private static final int DEFAULT_TIMEOUT_MS = 5000;
    private static final int READ_BUFFER_CHARS = 4096;

    private final Object lock = new Object();
    private final Handler mainHandler = new Handler(Looper.getMainLooper());
    private long generation;
    private Socket socket;
    private OutputStreamWriter writer;
    private UniJSCallback connectionCallback;

    @UniJSMethod(uiThread = false)
    public void connect(final String host, final int port, final int timeoutMs, final UniJSCallback callback) {
        final long token;
        synchronized (lock) {
            closeLocked("replaced");
            token = ++generation;
            connectionCallback = callback;
        }
        new Thread(new Runnable() {
            @Override
            public void run() {
                connectAndRead(host, port, timeoutMs > 0 ? timeoutMs : DEFAULT_TIMEOUT_MS, token, callback);
            }
        }, "MudTcp-connect").start();
    }

    private void connectAndRead(String host, int port, int timeoutMs, long token, UniJSCallback callback) {
        Socket newSocket = new Socket();
        try {
            newSocket.setTcpNoDelay(true);
            newSocket.setKeepAlive(true);
            newSocket.setReceiveBufferSize(64 * 1024);
            newSocket.connect(new InetSocketAddress(host, port), timeoutMs);
            OutputStreamWriter newWriter = new OutputStreamWriter(newSocket.getOutputStream(), GBK);
            InputStreamReader reader = new InputStreamReader(
                    new BufferedInputStream(newSocket.getInputStream(), 16 * 1024), GBK);

            synchronized (lock) {
                if (token != generation) {
                    newSocket.close();
                    return;
                }
                socket = newSocket;
                writer = newWriter;
            }
            emitKeepAlive(callback, event("open", null));

            char[] buffer = new char[READ_BUFFER_CHARS];
            while (isCurrent(token)) {
                long readStartedAt = System.currentTimeMillis();
                int count = reader.read(buffer);
                long receivedAt = System.currentTimeMillis();
                if (count < 0) break;
                if (count == 0) continue;
                Map<String, Object> data = event("data", new String(buffer, 0, count));
                data.put("nativeReceivedAt", receivedAt);
                data.put("nativeReadMs", receivedAt - readStartedAt);
                emitKeepAlive(callback, data);
            }
            finish(token, callback, "eof", null);
        } catch (Throwable error) {
            if (isGenerationCurrent(token)) {
                emitKeepAlive(callback, event("error", message(error)));
                finish(token, callback, "error", message(error));
            }
            try {
                newSocket.close();
            } catch (IOException ignored) {
            }
        }
    }

    @UniJSMethod(uiThread = false)
    public void send(final String text, final UniJSCallback callback) {
        final OutputStreamWriter currentWriter;
        synchronized (lock) {
            currentWriter = writer;
        }
        if (currentWriter == null || !isConnected()) {
            invokeOnce(callback, event("error", "TCP 未连接"));
            return;
        }
        new Thread(new Runnable() {
            @Override
            public void run() {
                try {
                    synchronized (currentWriter) {
                        currentWriter.write(text == null ? "" : text);
                        currentWriter.flush();
                    }
                    invokeOnce(callback, event("sent", null));
                } catch (IOException error) {
                    invokeOnce(callback, event("error", message(error)));
                }
            }
        }, "MudTcp-write").start();
    }

    @UniJSMethod(uiThread = false)
    public boolean isConnected() {
        synchronized (lock) {
            return socket != null && socket.isConnected() && !socket.isClosed();
        }
    }

    @UniJSMethod(uiThread = false)
    public void close() {
        synchronized (lock) {
            closeLocked("client");
        }
    }

    private boolean isCurrent(long token) {
        synchronized (lock) {
            return token == generation && socket != null && !socket.isClosed();
        }
    }

    private boolean isGenerationCurrent(long token) {
        synchronized (lock) {
            return token == generation;
        }
    }

    private void finish(long token, UniJSCallback callback, String reason, String error) {
        synchronized (lock) {
            if (token != generation) return;
            closeLocked(reason);
        }
        emitOnce(callback, event("close", error == null ? reason : error));
    }

    private void closeLocked(String reason) {
        generation++;
        OutputStreamWriter oldWriter = writer;
        Socket oldSocket = socket;
        writer = null;
        socket = null;
        connectionCallback = null;
        if (oldWriter != null) {
            try {
                oldWriter.close();
            } catch (IOException ignored) {
            }
        }
        if (oldSocket != null) {
            try {
                oldSocket.close();
            } catch (IOException ignored) {
            }
        }
    }

    private Map<String, Object> event(String type, String value) {
        Map<String, Object> result = new HashMap<>();
        result.put("type", type);
        if (value != null) result.put("data", value);
        return result;
    }

    private String message(Throwable error) {
        return error == null ? "未知 TCP 错误" : String.valueOf(error.getMessage());
    }

    private void emitKeepAlive(final UniJSCallback callback, final Map<String, Object> data) {
        if (callback == null) return;
        mainHandler.post(new Runnable() {
            @Override
            public void run() {
                callback.invokeAndKeepAlive(data);
            }
        });
    }

    private void emitOnce(final UniJSCallback callback, final Map<String, Object> data) {
        if (callback == null) return;
        mainHandler.post(new Runnable() {
            @Override
            public void run() {
                callback.invoke(data);
            }
        });
    }

    private void invokeOnce(final UniJSCallback callback, final Map<String, Object> data) {
        emitOnce(callback, data);
    }
}
