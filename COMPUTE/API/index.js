const express = require('express');
const cluster = require('cluster');
const os = require('os');
const app = express();
const bcrypt = require('bcrypt');
const validator = require("email-validator");
const nodemailer = require("nodemailer");
const puppeteer = require("puppeteer");
require('dotenv').config({ path: '../../.env' });
const jwt = require('jsonwebtoken');
app.use(express.json());


var numCore;
let refreshTokens = [];


if (process.env.AUTH_MAX_CORES == true) {
    numCore = os.cpus().length;
} else {
    numCore = process.env.AUTH_NUM_CORES;
}

app.get('/sankey', async (req, res) => {
    const browser = await puppeteer.launch();
    const page = await browser.newPage();

    //get data
    const file = require("./data2.json")
    //console.log(data)

    //tokenize Data
    const data = 
    {
        data: file,
    };
    const dataToken = tokenizeData(data);
    //go to page
    console.log(`http://localhost:3000/sankey/${dataToken}/600/600`)
    await page.goto(`http://localhost:3000/sankey/${dataToken}/600/600`)

    //get the svg text
    const svg = await page.evaluate(() => document.querySelector('#root').innerHTML)
    //console.log(svg);

    //send response
    res.send(svg).status(200);

});

function tokenizeData(data){
    return jwt.sign(data, process.env.URL_SECRET);
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
    
    app.listen(process.env.COMPUTE_PORT, () =>
        console.log(`Process ${process.pid} listening on port ${process.env.COMPUTE_PORT}`)
    );
}