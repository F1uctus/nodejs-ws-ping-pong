# Node.js WebSocket Ping-Pong

Bare-bones WebSocket ping-pong implementation with Node.js.
For testing &amp; educational purposes only.

Hosted on https://nodejs-ws-ping-pong.herokuapp.com

### Prerequisites

- NPM
- Node.js (tested on 17.8.0)

### Testing

Running a simple client-server communication test:

```bash
cd server
npm start &
SERVER_PID=$!
echo $SERVER_PID
sleep 3
cd ../client-nodejs
npm test
kill $SERVER_PID
cd ..
```

To test the Heroku deployment, one should instead do:

```bash
export NJWSPP_REMOTE=heroku
cd client-nodejs
npm test
cd ..
```

Testing from the browser:

https://nodejs-ws-ping-pong.herokuapp.com/client.html