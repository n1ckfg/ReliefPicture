"use strict";

const fs = require('fs');
const path = require("path")
const url = require('url');
const assert = require("assert");
const http = require("http");
const https = require("https");
const express = require("express");
const dotenv = require("dotenv").config();

// this will be true if there's no .env file
const IS_HTTP = (!process.env.PORT_HTTP);

const PORT_HTTP = IS_HTTP ? (process.env.PORT || 3000) : (process.env.PORT_HTTP || 80);
const PORT_HTTPS = process.env.PORT_HTTPS || 443;
const PORT = IS_HTTP ? PORT_HTTP : PORT_HTTPS;

const PUBLIC_PATH = path.join(__dirname, "public");

const updateInterval = 3000;

// allow cross-domain access (CORS)
const app = express();
app.use(function(req, res, next) {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  return next();
});

// promote http to https:
if (!IS_HTTP) {
  http.createServer(function(req, res) {
        res.writeHead(301, { "Location": "https://" + req.headers['host'] + req.url });
        res.end();
    }).listen(PORT_HTTP);
}

// create the primary server:
const server = IS_HTTP ? http.createServer(app) : https.createServer({
    key: fs.readFileSync(process.env.KEY_PATH),
    cert: fs.readFileSync(process.env.CERT_PATH)
}, app);

// serve static files from PUBLIC_PATH:
app.use(express.static(PUBLIC_PATH)); 
// default to index.html if no file given:
app.get("/", function(req, res) {
    res.sendFile(path.join(PUBLIC_PATH, "index.html"))
});

// start the server:
server.listen(PORT, function() {
    console.log("\nNode.js listening on port " + PORT);
});

const io = require("socket.io")(server, { 
    pingInterval: 5000,
    pingTimeout: 10000
});

// ~ ~ ~ ~ ~ ~   WEBHOOK   ~ ~ ~ ~ ~ ~ 
// https://opensourcelibs.com/lib/glitchub
const cmd = require("node-cmd");
const crypto = require("crypto"); 
const bodyParser = require("body-parser");

app.use(bodyParser.json());

const onWebhook = (req, res) => {
    let hmac = crypto.createHmac("sha1", process.env.SECRET);
    let sig  = `sha1=${hmac.update(JSON.stringify(req.body)).digest("hex")}`;

    if (req.headers["x-github-event"] === "push" && sig === req.headers["x-hub-signature"]) {
        cmd.run("chmod +x ./redeploy.sh"); 
        cmd.run("./redeploy.sh");
        cmd.run("refresh");
    }

    return res.sendStatus(200);
}

app.post("/redeploy", onWebhook);

app.get("/", function(req, res) {
    res.sendFile(__dirname + "/public/index.html");
});
// ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ 

let query = "garage";
let lineArtOnly = false;
let numReturns = 1;
let searchMode = 1;
let hostDomain = "www.google.com";
let queryPrepend = "/search?q="; //"/images?q=";
let queryAppend = "&hl=en&tbm=isch"; //&imgsz=Medium";
let queryLineArt = "&tbs=itp:lineart";
let userAgent = "Mozilla/5.0 (Windows NT 6.1) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/41.0.2228.0 Safari/537.36";
let answerPrepend = "";
let answerAppend = "";
let answerOrig = "";
let answer = "";
let spaceBad = "%252520";
let spaceGood = "%20";

let photoPaths = [];

function doSearch(_query) {
    if (searchMode == 0) {
        answerPrepend = "imgres?imgurl=";
        answerAppend = "&amp;imgrefurl";        
    } else if (searchMode == 1) {
        answerPrepend = "\"ou\":\"";
        answerAppend = "\",\"ow\":";        
    }

    if (lineArtOnly) queryAppend += queryLineArt;

    //let numTries = 0;
    let q = _query.replace(" ", "%20");
    let url = queryPrepend + q + queryAppend;
    console.log("Query is: " + hostDomain + url);

    // TODO set user agent

    let req, postOptions;
    const photoDoDebug = false;

    if (IS_HTTP) {
        postOptions = {
            hostname: hostDomain,
            port: 80,
            path: url,
            method: "GET"
        }

        req = http.request(postOptions, res => {
            console.log(`statusCode: ${res.statusCode}`);

            res.on("data", d => {
                parseSearchResults(d, photoDoDebug);
            });
        });
    } else {
        postOptions = {
            hostname: hostDomain,
            port: 443,
            path: url,
            method: "GET"
        }

        req = https.request(postOptions, res => {
            console.log(`statusCode: ${res.statusCode}`);

            res.on("data", d => {
                parseSearchResults(d, photoDoDebug);
            });
        });
    }

    req.on("error", error => {
        console.error(error);
    });

    req.end();
}

function parseSearchResults(data, doDebug) {
    if (doDebug) {
        process.stdout.write(data);
    }

    photoPaths = [];

    /*
    for (let property in data) {
        answerOrig = data[property].toString();
    }
    */
    answerOrig = data.toString();
    console.log(answerOrig);

    //while (numTries < numReturns) {
    while (photoPaths.length < numReturns) {
        answer = answerOrig;
        let startIndex = answer.indexOf(answerPrepend);
        answer = answer.substring(startIndex + answerPrepend.length);
        let endIndex = answer.indexOf(answerAppend); //"imgrefurl");
        answer = answer.substring(0, endIndex);//endIndex - 1);
        answerOrig = answerOrig.replace(answerPrepend + answer + answerAppend, "");
        answer = answer.replace(spaceBad, spaceGood);

        if (answer != null) {
            console.log("* " + answer);
            photoPaths.push(answer);
        }
    }

    if (photoPaths.length > 0) {
        io.emit("newImage", photoPaths);        
    } 
}

doSearch("mouse");

setInterval(function() {

}, updateInterval);