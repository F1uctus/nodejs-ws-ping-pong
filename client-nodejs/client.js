const http = require("http");
const crypto = require("crypto");
const {
    generateWebSocketAcceptHeaderValue,
    WSHeaders,
    encodeTextFrame, decodeTextMessage, encodeConnectionCloseFrame
} = require("../websocket");

const State = Object.freeze({
    CONNECTING: 0,
    OPEN: 1,
    CLOSING: 2,
    CLOSED: 3,
});

exports.WebSocketClient = class {
    /** State of our end of the connection */
    readyState = State.CONNECTING;

    /** Whether the server has sent a close handshake */
    serverClosed = false;

    /** @type NodeJS.Socket */
    socket = undefined;

    /** @type NodeJS.URL */
    url;

    onopen() {
    }

    onmessage(message) {
    }

    onerror(e) {
    }

    onclose() {
    }

    constructor(url, {protocol}) {
        if (!url) {
            throw new Error("Url and must be specified.");
        }
        this.url = new URL(url);

        const key = crypto.randomBytes(16).toString("base64")
        const headers = {
            "Connection": "Upgrade",
            "Upgrade": "WebSocket",
            "Sec-WebSocket-Key": key
        };
        if (protocol) {
            headers["Sec-WebSocket-Protocol"] = protocol;
        }

        let httpReq;
        switch (this.url.protocol) {
            case "ws:":
                httpReq = http.request({
                    hostname: this.url.hostname,
                    port: this.url.port || 80,
                    path: (this.url.pathname || "/") + (this.url.search || ""),
                    method: "POST",
                    headers: headers
                });
                break;
            default:
                this.onerror(new Error("Invalid URL scheme specified."));
                return;
        }

        httpReq.on("upgrade", (res, socket, head) => {
            const expectedAcceptValue = generateWebSocketAcceptHeaderValue(key);
            if (res.headers[WSHeaders.SecAccept] !== expectedAcceptValue) {
                this.onerror(new Error("Server accept key mismatch."));
                return;
            }
            this.socket = socket;
            httpReq.removeAllListeners("upgrade");
            socket.removeAllListeners("data");
            socket.on("data", b => this.#dataHandler(b));
            socket.on("error", () => this.onerror());
            socket.on("close", () => this.#finishClose());
            this.readyState = State.OPEN;
            this.onopen();
        });

        httpReq.on("error", e => {
            httpReq.end();
            this.onerror(e);
        });

        httpReq.end();
    }

    /** @param buffer {Buffer} */
    #dataHandler(buffer) {
        if (buffer.length <= 0 || this.serverClosed) {
            return;
        }
        const message = decodeTextMessage(buffer);
        if (this.serverClosed) {
            if (this.readyState === State.OPEN) {
                this.#sendClose();
            }
        }
        this.onmessage({
            data: message
        });
    }

    close() {
        if (this.readyState !== State.OPEN) {
            return;
        }
        this.#sendClose();
    }

    #sendClose() {
        this.readyState = State.CLOSING;
        this.socket.write(encodeConnectionCloseFrame(), () => this.#finishClose);
    }

    #finishClose() {
        this.readyState = State.CLOSED;

        if (this.socket) {
            this.socket.end();
            this.socket = undefined;
        }

        this.onclose();
    }

    /** @param str {string} */
    send(str) {
        if (this.readyState !== State.OPEN) {
            return;
        }

        this.socket.write(encodeTextFrame(str));
    }
}
