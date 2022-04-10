const {WebSocketClient} = require("./client");

const ws = new WebSocketClient("ws://localhost:3300", {
    protocol: "ping-pong"
})
ws.onopen = async () => {
    console.log("Connection established");
    for (let i = 0; i < 5; i++) {
        console.log(">>> ping");
        ws.send("ping");
        await new Promise(x => setTimeout(x, 2000));
    }
    ws.close();
}
ws.onmessage = message => console.log("<<< " + message.data);
ws.onerror = console.log;
ws.onclose = () => console.log("Connection closed")
