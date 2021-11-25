const AWS = require('aws-sdk'); //Connection client to database
const express = require('express'); //Routing Service
const cluster = require('cluster'); //Enable concurrency
const os = require('os'); //To gain access to the core count
const app = express();
const bcrypt = require('bcrypt'); //Encryption
const validator = require("email-validator"); //Check for email
const nodemailer = require("nodemailer");
require('dotenv').config({ path: '../.env' }); //Get environment variables
const jwt = require('jsonwebtoken'); //Get JWT

//Create connection to the database
AWS.config.update({
    region: process.env.AWS_DEFAULT_REGION,
    accessKeyId: process.env. AWS_ACCESS_KEY,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
});

const dynamoClient = new AWS.DynamoDB.DocumentClient;
const USER_TABLE = "users";

const getUser = async (name)=> {
    const params = {
        TableName: USER_TABLE,
        KeyConditionExpression: "#un = :n",
        ExpressionAttributeNames:{
            "#un": "username"
        },
        ExpressionAttributeValues: {
           ":n": name
        }
    };
    const users = await dynamoClient.query(params).promise();
    return users;
}

var numCore;

if (process.env.API_MAX_CORES == true) {
    numCore = os.cpus().length;
} else {
    numCore = process.env.API_NUM_CORES;
}

app.use(express.json());

//Get logs
app.get('/fetchLogs', async (req, res) => {
    var dbUser = await getUser(req.body.username);
    dbUser = dbUser.Items[0];
    return res.status(200).json({logs: dbUser.logs})
})

//Put log
app.post("/addLog", async (req, res) => {
    const newLog = req.body.log;
    var dbUser = await getUser(req.body.username);
    dbUser = dbUser.Items[0];
    dbUser.logs.push(newLog);
    const params = {
        TableName: USER_TABLE,
        Item: dbUser
    };
    await dynamoClient.put(params).promise();
    return res.sendStatus(200);
})

//Delete log
app.delete("/deleteLog", async (req, res) => {
    const newLog = req.body.log;
    var dbUser = await getUser(req.body.username);
    dbUser = dbUser.Items[0];
    let index = -1
    for(var i = 0; i < dbUser.logs.length; i++){
        if(dbUser.logs[i].time_created === newLog.time_created){
            index = i;
            break;
        }
    }
    if(index > -1){
        dbUser.logs.splice(index,1)
    }
    const params = {
        TableName: USER_TABLE,
        Item: dbUser
    };
    await dynamoClient.put(params).promise();
    return res.sendStatus(200);
})

function authenticateToken(req, res, next) {
    const token = req.headers.authorization;
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