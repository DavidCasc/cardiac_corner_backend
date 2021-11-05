const express = require('express');
const cluster = require('cluster');
const os = require('os');
const app = express();
const bcrypt = require('bcrypt');
const validator = require("email-validator");
const nodemailer = require("nodemailer");
const mongoose = require("mongoose");
const mongodb = require("mongodb")
require('dotenv').config({ path: '../.env' });
const User = require("./models/User")


const jwt = require('jsonwebtoken');

const transporter = nodemailer.createTransport({
    service: 'Gmail',
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
    },
});

async function connectDB() {
    await mongoose.connect("mongodb+srv://Admin:Admin@cluster0.ljjgp.mongodb.net/main?retryWrites=true&w=majority", {useNewUrlParser: true,useUnifiedTopology: true,}, () => console.log("Connected DB"));
}
app.use(express.json());


var numCore;
let refreshTokens = [];
let users = [
    {
        username: "john",
        password: "test",
        confirmed: "true"
    }
];


if (process.env.AUTH_MAX_CORES == true) {
    numCore = os.cpus().length;
} else {
    numCore = process.env.AUTH_NUM_CORES;
}

app.get('/confirmation/:token', async (req, res) => {
    try {
        const { user: { id } } = jwt.verify(req.params.token, EMAIL_SECRET);
        //await models.User.update({ confirmed: true }, { where: { id } });
    } catch (e) {
        res.send('error');
    }

    return res.redirect('http://localhost:3001/login');
});

app.post('/register', async (req, res) => {
    //get user information from the request
    const username = req.body.username;
    const password = req.body.password;

    //check database for username
    const dbUser = users.find(user => user.username === username);

    if (dbUser != null) {
        return res.status(400).send('User already exists');
    }

    //Encrypt/hash the password
    const hashPass = await bcrypt.hash(password, 10);
    //Create the user
    try {
        const newUser = new User({
            email: username,
            password: hashPass,
        });
        const user = await newUser.save();
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

app.post('/login', (req, res) => {
    //Authenticate user
    const username = req.body.username;
    const userCheck = users.find(user => user.username === username)
    if (userCheck == null) {
        return res.status(400).send('Cannot find user')
    }
    try {
        if (bcrypt.compare(req.body.password, userCheck.password)) {
            const user = { name: username };
            const accessToken = generateAccessToken(user);

            const refreshToken = jwt.sign(user, process.env.REFRESH_TOKEN_SECRET)

            refreshTokens.push(refreshToken);
            return res.json({ accessToken: accessToken, refreshToken: refreshToken });
        } else {
            res.send('Not Allowed')
        }
    } catch {
        res.status(500).send()
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
    return jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, { expiresIn: '15s' });
}

function generateEmailToken(data) {
    return jwt.sign(data, process.env.EMAIL_SECRET, { expiresIn: '1d' });
}

if (cluster.isMaster) {
    connectDB()
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
        console.log(`Process ${process.pid} listening on port ${process.env.AUTH_PORT}`)
    );
}