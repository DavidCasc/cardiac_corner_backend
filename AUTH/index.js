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

//Function to delete users
const deleteUser = async (name) => {
    const params = {
        TableName: USER_TABLE,
        Key:{
            username: name
        }
    };
    const users = await dynamoClient.delete(params).promise();
    return users;
}
const getUsers = async ()=> {
    const params = {
        TableName: USER_TABLE,
    };
    const users = await dynamoClient.scan(params).promise();
    return users;
}

//Function to find user
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
//Validate user
const validateUser = async (token) => {
    const username = jwt.verify(token, process.env.EMAIL_SECRET).user;
    user = await getUser(username)
    user = user.Items[0]
    user.verfication = true
    const params = {
        TableName: USER_TABLE,
        Item: user
    };
    await dynamoClient.put(params).promise();
    return
}

//Function to add user
const addUser = async (username, password) => {
    const params = {
        TableName: USER_TABLE,
        Item: {
            "username": username,
            "password": password,
            "verfication": false
        }
    };
    return await dynamoClient.put(params).promise();
}

const transporter = nodemailer.createTransport({
    service: 'Gmail',
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
    },
});

//Start app
app.use(express.json());

//Find the numbers of cores the api is going to use
if (process.env.AUTH_MAX_CORES == true) {
    numCore = os.cpus().length;
} else {
    numCore = process.env.AUTH_NUM_CORES;
}

app.get("/users", async (req, res) => {
    const users = await getUsers()
    return res.send(users)
})

//Create an end point for the verification
app.get('/confirm/:token', async (req, res) => {
    try {
        validateUser(req.params.token);
    } catch (e) {
        res.send('error');
    }
    return res.status(200).send("Thank you for registering! You can close this page");
});

//Create an end point register users
app.post('/register', async (req, res) => {
    //get user information from the request
    const username = req.body.username;
    const password = req.body.password;

    //check database for username
    const dbUser = await getUser(username);
    //Return if found
    if (dbUser.Count != 0) {
        return res.status(400).send('User already exists');
    }

    //Encrypt/hash the password
    const hashPass = await bcrypt.hash(password, 10);

    //Create the user
    try {
        await addUser(username, hashPass);
    }   catch (err){
        console.log(err)
        return res.status(400).json(err)
    }
    
    //Send email
    const data = { user: username };
    const emailToken = generateEmailToken(data);

    console.log('generated token');

    const url = `http://localhost:${process.env.AUTH_PORT}/confirm/${emailToken}`

    console.log('generated url');

    transporter.sendMail({
        to: username,
        subject: 'Confirm Email',
        html: `Please click this email to confirm your email: <a href="${url}">${url}</a>`,
    });
    res.sendStatus(200)
})

app.delete("/delete", (req, res) => {
    deleteUser("casciano.david@gmail.com")
    return res.send(200)
})

app.post('/login', async (req, res) => {
    //Authenticate user
    const username = req.body.username;
    const user = await getUser(username)
    if (user.Count == 0) {
        return res.status(400).send('Cannot find user')
    }
    try{
        if (await(bcrypt.compare(req.body.password, user.Items[0].password))) {
            const resUser = user.Items[0].username;
            const accessToken = generateAccessToken(resUser);
            console.log(accessToken)
            const refreshToken = jwt.sign(resUser, process.env.REFRESH_TOKEN_SECRET)
            return res.status(200).json({ accessToken: accessToken, refreshToken: refreshToken });
        } else {
            return res.status(405).send('Not Allowed')
        } 
    } catch {
        return res.status(500).send("Error Occurred")
    }
})

app.post('/token', (req, res) => {

    console.log("running");
    //Get refresh token from the body of the request
    const refreshToken = req.body.token;
    if (refreshToken == null) {
        return res.sendStatus(401);
    }
    if (!refreshTokens.includes(refreshToken)) {
        return res.sendStatus(403);
    }

    //Verify token with the secret
    jwt.verify(refreshToken, process.env.REFRESH_TOKEN_SECRET, (err, user) => {
        if (err) {
            return res.sendStatus(403);
        }
        //Generate short life access token
        const accessToken = generateAccessToken({ name: user.name });
        res.json({ accessToken: accessToken })
    })
})

app.delete('/logout', (req, res) => {
    refreshTokens = refreshTokens.filter(token => token !== req.body.token);
    res.sendStatus(204);
})

function generateAccessToken(user) {
    return jwt.sign({user}, process.env.ACCESS_TOKEN_SECRET, { expiresIn: '15s' });
}

function generateEmailToken(data) {
    return jwt.sign(data, process.env.EMAIL_SECRET, { expiresIn: '1y' });
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
    app.listen(process.env.AUTH_PORT, () =>
        console.log(`Process ${process.pid} on port ${process.env.AUTH_PORT}`)
    );
}