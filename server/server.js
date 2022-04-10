const http = require("http");
const crypto = require("crypto");
const fs = require("fs");


// WebSocket-specific constants
const WS_ACCEPT_GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";
const WSOpCodes = Object.freeze({
    continuationFrame: 0,
    textFrame: 1,
    binaryFrame: 2,
    connectionCloseFrame: 8,
    pingFrame: 9,
    pongFrame: 10,
});
const WS_FINAL_FRAME_BIT_MASK = 0b10000000;
const WS_EXPECT_TWO_EXTRA_BYTES_FOR_PAYLOAD_LENGTH = 126;



const server = http.createServer((req, res) => {
    if (req.url === "/client.html") {
        res.writeHead(200, { "Content-Type": "text/html" });
        fs.createReadStream("../client/index.html").pipe(res);
    } else {
        res.end();
    }
});

server.on("upgrade", (req, socket) => {
    const upgradeHeader = req.headers["upgrade"];
    if (upgradeHeader !== "websocket") {
        console.error(
            `${webSocketKeyHeader}: Unsupported Upgrade requested: ${upgradeHeader}.`
        );
        socket.end("HTTP/1.1 400 Bad Request");
        return;
    }

    const webSocketKeyHeader = req.headers["sec-websocket-key"];
    const hash = generateWebSocketAcceptHeaderValue(webSocketKeyHeader);
    const responseHeaders = [
        "HTTP/1.1 101 Switching Protocols",
        "Upgrade: WebSocket",
        "Connection: Upgrade",
        "Sec-WebSocket-Accept: " + hash
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
        } else if (message === WSOpCodes.pingFrame) {
            console.log(`${webSocketKeyHeader}: Ping (opcode).`);
            socket.write(encodePongFrame());
        } else if (message === null) {
            console.log(`${webSocketKeyHeader}: Failed to handle client's message.`);
        }
    });

    socket.on("close", () => {
        console.log(`${webSocketKeyHeader}: Socket was closed.`);
    });

    const response = responseHeaders.join("\r\n") + "\r\n\r\n";
    console.log(`${webSocketKeyHeader}: Completing the handshake:\n${response}`);

    socket.write(response);
});

function generateWebSocketAcceptHeaderValue(key) {
    return crypto
        .createHash("sha1")
        .update(key + WS_ACCEPT_GUID, "binary")
        .digest("base64");
}


/** https://datatracker.ietf.org/doc/html/rfc6455#section-5.2
 *  0                   1                   2                   3
 *  0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1
 * +-+-+-+-+-------+-+-------------+-------------------------------+
 * |F|R|R|R| opcode|M| Payload len |    Extended payload length    |
 * |I|S|S|S|  (4)  |A|     (7)     |             (16/64)           |
 * |N|V|V|V|       |S|             |   (if payload len==126/127)   |
 * | |1|2|3|       |K|             |                               |
 * +-+-+-+-+-------+-+-------------+ - - - - - - - - - - - - - - - +
 * |     Extended payload length continued, if payload len == 127  |
 * + - - - - - - - - - - - - - - - +-------------------------------+
 * |                               |Masking-key, if MASK set to 1  |
 * +-------------------------------+-------------------------------+
 * | Masking-key (continued)       |          Payload Data         |
 * +-------------------------------- - - - - - - - - - - - - - - - +
 * :                     Payload Data continued ...                :
 * + - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - +
 * |                     Payload Data continued ...                |
 * +---------------------------------------------------------------+
 */
function decodeTextMessage(buffer) {
    const firstByte = buffer.readUInt8(0);
    // first bit
    const isFinalFrame = Boolean(firstByte & WS_FINAL_FRAME_BIT_MASK);
    // 3 reserved bits skipped
    // 4-8 bits
    const opCode = firstByte & 0b0000_1111;

    if (opCode === WSOpCodes.connectionCloseFrame) {
        return WSOpCodes.connectionCloseFrame;
    }

    if (opCode === WSOpCodes.pingFrame) {
        return WSOpCodes.pingFrame;
    }

    if (opCode !== WSOpCodes.textFrame) {
        // Binary & other types of frames are not supported
        return undefined;
    }

    const secondByte = buffer.readUInt8(1);
    const masked = Boolean(secondByte & 0b1000_0000);

    let offset = 2;

    let payloadLength = secondByte & 0b0111_1111;
    if (payloadLength > 125) {
        if (payloadLength === WS_EXPECT_TWO_EXTRA_BYTES_FOR_PAYLOAD_LENGTH) {
            payloadLength = buffer.readUInt16BE(offset);
            offset += 2;
        } else {
            // Frame too large, not supported.
            return undefined;
        }
    }

    let maskingKey;
    if (masked) {
        maskingKey = buffer.readUInt32BE(offset);
        offset += 4;
    }

    const payloadData = Buffer.alloc(payloadLength);
    if (masked) {
        for (let i = 0, j = 0; i < payloadLength; ++i, j = i % 4) {
            const shift = j == 3 ? 0 : (3 - j) << 3;
            const mask = (shift == 0
                              ? maskingKey
                              : (maskingKey >>> shift)
                         ) & 0b1111_1111;
            const source = buffer.readUInt8(offset);
            offset++;
            payloadData.writeUInt8(mask ^ source, i);
        }
    } else {
        buffer.copy(
            /* target */ payloadData,
            /* target start */ 0,
            /* source start */ offset
        );
    }

    return payloadData.toString("utf8");
}



function encodePongFrame() {
    return Buffer.from(Uint8Array.from([
        WSOpCodes.pongFrame & WS_FINAL_FRAME_BIT_MASK,
        0 // length
    ]));
}

function encodeTextFrame(data) {
    const payloadBytesCount = Buffer.byteLength(data);

    let payloadByteOffset = 2;
    let buffer;
    if (payloadBytesCount <= 125) {
        // final mark + opcode + mask + length (actual)
        buffer = Buffer.alloc(payloadByteOffset + payloadBytesCount);
        buffer.writeUInt8(WSOpCodes.textFrame | WS_FINAL_FRAME_BIT_MASK, 0);
        buffer.writeUInt8(payloadBytesCount, 1);
    } else if (payloadBytesCount <= 65535) {
        // final mark + opcode + mask + length (= 126, actual length goes in the next 2 bytes)
        const extraBytesForLengthCount = 2;
        payloadByteOffset += extraBytesForLengthCount;
        buffer = Buffer.alloc(payloadByteOffset + payloadBytesCount);
        buffer.writeUInt8(WSOpCodes.textFrame | WS_FINAL_FRAME_BIT_MASK, 0);
        buffer.writeUInt8(WS_EXPECT_TWO_EXTRA_BYTES_FOR_PAYLOAD_LENGTH, 1);
        buffer.writeUInt16BE(payloadBytesCount, 2);
    } else {
        // Larger chunks are not supported.
        return encodePongFrame();
    }

    buffer.write(data, payloadByteOffset);

    return buffer;
}



const PORT = 3300;
server.listen(PORT, () => {
    console.log(`Ping-Pong WebSocket server running at http://localhost:${PORT}`);
});
