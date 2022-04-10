const {WebSocketClient} = require("./client");

const HOST = process.env.NJWSPP_REMOTE === "heroku"
    ? "wss://nodejs-ws-ping-pong.herokuapp.com"
    : "ws://localhost:3300";

const ws = new WebSocketClient(HOST, {
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
