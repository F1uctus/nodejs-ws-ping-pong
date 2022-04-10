const
    http = require("http"),
    fs = require("fs"),
    {
        generateWebSocketAcceptHeaderValue,
        WSHeaders,
        WSOpCodes,
        encodePongFrame,
        encodeTextFrame,
        decodeTextMessage
    } = require("../websocket");


const server = http.createServer((req, res) => {
    if (req.url === "/client.html") {
        res.writeHead(200, {"Content-Type": "text/html"});
        fs.createReadStream("../client/index.html").pipe(res);
    } else {
        res.end();
    }
});

server.on("error", err => {
    console.error(err.stack);
})

server.on("upgrade", (req, socket) => {
    socket.on("error", server.listeners("error")[0]);
    const webSocketKeyHeader = req.headers["sec-websocket-key"];
    const upgradeHeader = req.headers["upgrade"] ?? "";
    if (upgradeHeader.toLowerCase() !== "websocket") {
        console.error(
            `${webSocketKeyHeader}: Unsupported Upgrade requested: ${upgradeHeader}.`
        );
        socket.end("HTTP/1.1 400 Bad Request");
        return;
    }
    const hash = generateWebSocketAcceptHeaderValue(webSocketKeyHeader);
    const responseHeaders = [
        "HTTP/1.1 101 Switching Protocols",
        "Upgrade: WebSocket",
        "Connection: Upgrade",
        WSHeaders.SecAccept + ": " + hash
    ];

    const protocolHeader = req.headers["sec-websocket-protocol"];
    const protocols = protocolHeader?.split(",").map(s => s.trim()) ?? [];
    if (protocols.includes("ping-pong")) {
        responseHeaders.push("Sec-WebSocket-Protocol: ping-pong");
    } else if (!protocolHeader) {
        // No specific protocol was requested by client
    } else {
        console.error(
            `${webSocketKeyHeader}: Unsupported WebSocket protocol requested: ${protocolHeader}.`
        );
        socket.end("HTTP/1.1 400 Bad Request");
        return;
    }

    socket.on("data", buffer => {
        const message = decodeTextMessage(buffer);
        if (message === "ping") {
            console.log(`${webSocketKeyHeader}: Ping (text).`);
            socket.write(encodeTextFrame("pong"));
        } else if (message === WSOpCodes.connectionCloseFrame) {
            console.log(`${webSocketKeyHeader}: WebSocket connection closed by the client.`);
            socket.end();
            socket.destroy();
        } else if (message === WSOpCodes.pingFrame) {
            console.log(`${webSocketKeyHeader}: Ping (opcode).`);
            socket.write(encodePongFrame());
        } else if (message === null) {
            console.log(`${webSocketKeyHeader}: Failed to handle client's message.`);
        }
    });

    socket.on("close", () => {
        console.log(`${webSocketKeyHeader}: Socket was closed.`);
        socket.end();
        socket.destroy();
    });

    const response = responseHeaders.join("\r\n") + "\r\n\r\n";
    console.log(`${webSocketKeyHeader}: Completing the handshake:\n${response}`);

    socket.write(response);
});


const PORT = process.env.PORT || 3300;
server.listen(PORT, () => {
    console.log(`Ping-Pong WebSocket server running at http://localhost:${PORT}`);
});
