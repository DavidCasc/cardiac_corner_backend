const AWS = require('aws-sdk'); //Connection client to database
const express = require('express'); //Routing Service
const cluster = require('cluster'); //Enable concurrency
const os = require('os'); //To gain access to the core count
const app = express(); //Start the express app
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
const TOKEN_TABLE = "tokens";

/**
 * The deleteUser(name) function is an asyncronous function which will remove
 * users from the user table hosted on AWS Dynamo
 * @param name username value for the account
 * @returns user table
 */
const deleteUser = async (name) => {
    const params = {
        TableName: USER_TABLE,
        Key:{
            email: name
        }
    };
    const users = await dynamoClient.delete(params).promise();
    return users;
}

/**
 * The getUsers() function is an asyncronus function which will return the 
 * entrity of the user table hosted on AWS Dynamo
 * 
 * @returns the enrity of the users table
 */
const getUsers = async ()=> {
    const params = {
        TableName: USER_TABLE,
    };
    const users = await dynamoClient.scan(params).promise();
    return users;
}

/**
 * The getUser(name) function is an asyncronus function which will return
 * the user infirmation which matched the username
 * @param name is the username value which you are trying to search
 * @returns the search results of the dynamo search
 */
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

/**
 * The getToken(token) function will search and return the token within the tokens
 * table. This is a table which is hosted on AWS Dynamo and holds the refresh tokens.
 * @param token is the value of which you want to check existed in the token
 * table 
 * @returns the token which is in the database
 */
const getToken = async (token) => {
    const params = {
        TableName: TOKEN_TABLE,
        KeyConditionExpression: "#un = :n",
        ExpressionAttributeNames:{
            "#un": "token"
        },
        ExpressionAttributeValues: {
           ":n": token
        }
    };
    const dbToken = await dynamoClient.query(params).promise();
    return dbToken;
}

/**
 * The addToke(token) function is a asyncronous function which adds the refresh token
 * to the tokens table. 
 * @param token is the value of the refresh token you are adding to the table 
 * @returns a table of all the tokens
 */
const addToken = async (token) => {
    const params = {
        TableName: TOKEN_TABLE,
        Item: {
            "token": token
        }
    };
    return await dynamoClient.put(params).promise();
}

//Function to remove token from table
const removeToken = async (tokenVal) => {
    const params = {
        TableName: TOKEN_TABLE,
        Key:{
            token: tokenVal
        }
    };
    const users = await dynamoClient.delete(params).promise();
    return users;
}
//Validate user
const validateUser = async (token) => {
    const userVal = jwt.verify(token, process.env.EMAIL_SECRET).user;
    let user = await getUser(userVal)
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
const addUser = async (username, password, email) => {
    const params = {
        TableName: USER_TABLE,
        Item: {
            "email": email,
            "username": username,
            "password": password,
            "verfication": false,
            "logs": []
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
    const email = req.body.email;
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
        await addUser(username, hashPass, email);
    }   catch (err){
        console.log(err)
        return res.status(400).json(err)
    }
    
    //Send email
    const data = { user: username };
    const emailToken = generateEmailToken(data);

    const url = `http://localhost:${process.env.AUTH_PORT}/confirm/${emailToken}`

    transporter.sendMail({
        to: email,
        subject: 'Confirm Email',
        html: `Please click this email to confirm your email: <a href="${url}">${url}</a>`,
    });
    return res.status(200).json({email: email})
})
//Create endpoint to delete user
app.delete("/delete", (req, res) => {
    //delete user by email
    deleteUser(req.body.email)
    return res.sendStatus(200)
})

//Login endpoint
app.post('/login', async (req, res) => {
    //Authenticate user
    const username = req.body.username;
    const user = await getUser(username)

    //Check if the user is in the database
    if (user.Count == 0) {
        return res.status(400).send('Cannot find user')
    }
    try{
        //encrypt the given password from the request
        if (await(bcrypt.compare(req.body.password, user.Items[0].password))) {
            const resUser = user.Items[0].username; //get details from db
            const resEmail = user.Items[0].email
            const accessToken = generateAccessToken(resUser);
            const refreshToken = jwt.sign(resUser, process.env.REFRESH_TOKEN_SECRET)
            await addToken(refreshToken);
            return res.status(200).json({ email: resEmail, accessToken: accessToken, refreshToken: refreshToken}); //send back refresh token
        } else {
            return res.status(405).send('Not Allowed')
        } 
    } catch {
        return res.status(500).send("Error Occurred")
    }
})

//Create an endpoint to provide access tokens
app.post('/token', async (req, res) => {
    //Get refresh token from the body of the request
    const refreshToken = req.body.token;
    if (refreshToken == null) {
        return res.sendStatus(401);
    }

    //chech if the tokent is still in the database
    const dbToken = await getToken(refreshToken);
    if(dbToken.Count == 0) {
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

//Create function for future logouts to delete token from database
app.delete('/logout/:token', async (req, res) => {
    const token = req.params.token;
    await removeToken(token)
    res.status(200).json({token: token});
})

function generateAccessToken(user) {
    return jwt.sign({user}, process.env.ACCESS_TOKEN_SECRET, { expiresIn: '30s' });
}

function generateEmailToken(data) {
    return jwt.sign(data, process.env.EMAIL_SECRET, { expiresIn: '1y' });
}

//Multithreading loop
if (cluster.isMaster) {
    //fork if master/main
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
    //If child process run script
    app.listen(process.env.AUTH_PORT, () =>
        console.log(`Process ${process.pid} on port ${process.env.AUTH_PORT}`)
    );
}