const express = require('express');
const cluster = require('cluster');
const os = require('os');
const app = express();
require('dotenv').config({ path: '../.env' });

const jwt = require('jsonwebtoken');

app.use(express.json());
app.use(express.static(__dirname));


const logs = [
    {
        username: "john",
        title: 'Jane stressed me out'
    },
    {
        username: 'jane',
        title: 'John stressed me out'
    }
];

var numCore;

if (process.env.API_MAX_CORES == true) {
    numCore = os.cpus().length;
} else {
    numCore = process.env.API_NUM_CORES;
}

app.get('/test', (req, res) => {
    res.sendFile(__dirname + '/test.svg');
})

app.get('/fetchLogs', authenticateToken, (req, res) => {
    res.json(logs.filter(log => log.username === req.user.name))
})

function authenticateToken(req, res, next) {

    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (token == null) {
        return res.sendStatus(401);
    }

    jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, user) => {
        if (err) {
            return res.sendStatus(403);
        }

        req.user = user;

        next()
    })
}

if (cluster.isMaster) {
    for (let i = 0; i < numCore; i++) {
        cluster.fork();
    }

    cluster.on("exit", (worker, code, signal) => {
        console.log("#####################################");
        console.log(`worker ${worker.process.pid} died`);
        console.log(`code: ${code}`);
        console.log(`signal: ${signal}`);
        console.log("#####################################");
        cluster.fork();
    });
} else {
    app.listen(process.env.API_PORT, () =>
        console.log(`Process ${process.pid} listening on port ${process.env.API_PORT}`)
    );
}