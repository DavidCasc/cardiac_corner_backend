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

//Create a helper function to get user from dynamodb
const getUser = async (name)=> {
    //Create parameters
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
    //call to dynamodb
    const users = await dynamoClient.query(params).promise();
    return users;
}

var numCore;

//get number of cores from os
if (process.env.API_MAX_CORES == true) {
    numCore = os.cpus().length;
} else {
    numCore = process.env.API_NUM_CORES;
}

app.use(express.json());

//Get logs
app.get('/fetchLogs/:user', async (req, res) => {
    var dbUser = await getUser(req.params.user);
    dbUser = dbUser.Items[0];
    return res.status(200).json({logs: dbUser.logs})
})

//Put log
app.post("/addLog", async (req, res) => {
    //get username from request body
    const newLog = req.body.log;

    //get user from db
    var dbUser = await getUser(req.body.username);
    dbUser = dbUser.Items[0];
    //add new log
    dbUser.logs.push(newLog);
    //create new parameters
    const params = {
        TableName: USER_TABLE,
        Item: dbUser
    };
    //push to db
    await dynamoClient.put(params).promise();
    return res.send({log: req.body.log}).status(200);
})

//Clear all logs
app.delete('/deleteAll/:user', async (req,res) => {
    //get user from paremeters
    console.log(req.params.user);
    var dbUser = await getUser(req.params.user);
    console.log(dbUser)
    dbUser = dbUser.Items[0];
    console.log(dbUser);
    //cleare db logs
    dbUser.logs = [];
    const params = {
        TableName: USER_TABLE,
        Item: dbUser
    };

    //push to db
    console.log(params);
    await dynamoClient.put(params).promise();
    return res.sendStatus(200);
})

//Delete log
app.delete("/deleteLog/:user/:date", async (req, res) => {
    //get paremeters from endpoints
    const date = req.params.date;
    const user = req.params.user;
    //get user from db
    var dbUser = await getUser(user);
    dbUser = dbUser.Items[0];
    let index = -1
    //iterate through the users logs to find logs
    for(var i = 0; i < dbUser.logs.length; i++){
        if(dbUser.logs[i].time_created === date){
            index = i;
            break;
        }
    }
    if(index > -1){
        dbUser.logs.splice(index,1)
    }
    //delete and push
    const params = {
        TableName: USER_TABLE,
        Item: dbUser
    };
    await dynamoClient.put(params).promise();
    return res.send({index: index}).status(200);
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


//Multithreading loop
if (cluster.isMaster) {
    //fork if master
    for (let i = 0; i < numCore; i++) {
        cluster.fork();
    }
    //monitor child processes
    cluster.on("exit", (worker, code, signal) => {
        console.log("#####################################");
        console.log(`worker ${worker.process.pid} died`);
        console.log(`code: ${code}`);
        console.log(`signal: ${signal}`);
        console.log("#####################################");
        cluster.fork();
    });
} else {
    //Preform app if child process
    app.listen(process.env.API_PORT, () =>
        console.log(`Process ${process.pid} listening on port ${process.env.API_PORT}`)
    );
}