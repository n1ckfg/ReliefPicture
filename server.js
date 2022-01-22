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

let query = [
"... 8 ...",
"... 7 ...",
"... 6 ...",
"... 5 ...",
"... 4 ...",
"... 3 ...",
"... 2 ...",
"... 1 ...",
"A Taxonomy of the Universe",
"(According to Conversations with GPT-2)",
"EVERYTHING.",
"An empty bottle of wine",
"A box of cereal",
"An old piece of furniture",
"A Blu-ray disc",
"A lawnmower",
"A pair of underwear",
"A nice shiny rock",
"A small piece of cloth",
"A large piece of rubber",
"A piece of PVC pipe I had lying around",
"A plastic bag",
"THINGS THAT RESPOND TO STIMULI.",
"Cnidaria",
"Bryozoa",
"Diatoms",
"Echinoderms",
"Phytoplankton",
"Fungi",
"Bryozoans",
"An amoeba",
"A paramecium",
"THINGS THAT REMEMBER PAST STIMULI.",
"Arthropods",
"Amphibians",
"Box jellies",
"Snails",
"THINGS THAT MODEL THEIR ENVIRONMENT TO PREDICT THE FUTURE.",
"A bird",
"An ape",
"A dog",
"A dolphin",
"An elephant",
"A bunch of really strange fish",
"A deer trapped in a hole",
"THINGS WHOSE PREDICTIVE MODEL OF THEIR ENVIRONMENT INCLUDES THEMSELVES.",
"A child who is developing the conceptual frameworks that the adult world is full of.",
"A child who experiences an increasing number of stimuli, most of which are challenging. ",
"A child who copes with other people's criticisms.",
"A child who learns how to deal with failure."
];

let queryCounter = 0;
const updateIntervalBase = 2000;
const updateIntervalAdjustment = 100; // per character in query
const photoDoDebug = false;

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

let lineArtOnly = false;
let numReturns = 10;
let searchMode = 2;
let hostDomain = "www.google.com";
let queryPrepend = "/search?q="; //"/images?q=";
let queryAppend = "&hl=en&tbm=isch"; //&imgsz=Medium";
let queryLineArt = "&tbs=itp:lineart";
//let userAgent = "Mozilla/5.0 (Windows NT 6.1) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/41.0.2228.0 Safari/537.36";
let answerPrepend = "";
let answerAppend = "";
let answerOrig = "";
let answer = "";
let spaceBad = "%252520";
let spaceGood = "%20";

let photoPaths = [];

function doSearch(_query) {
    switch (searchMode) {
        case 0:
            answerPrepend = "imgres?imgurl=";
            answerAppend = "&amp;imgrefurl";  
            break;
        case 1:
            answerPrepend = "\"ou\":\"";
            answerAppend = "\",\"ow\":";      
            break;
        case 2:
            answerPrepend = "http://t0.gstatic.com/images?";
            answerAppend = "&amp;s";      
            break;
    }

    if (lineArtOnly) queryAppend += queryLineArt;

    //let numTries = 0;
    let q = _query.replaceAll(" ", "%20");
    let url = queryPrepend + q + queryAppend;
    console.log("Query is: " + hostDomain + url);

    // TODO set user agent

    let req, postOptions;

    //if (IS_HTTP) {
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
    /*
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
    */

    req.on("error", error => {
        console.error(error);
    });

    req.end();
}

function parseSearchResults(data, doDebug) {
    if (doDebug) {
        process.stdout.write(data);
    } else {
        photoPaths = [];

        answerOrig = data.toString();

        for (let i=0; i<numReturns; i++) {
            answer = answerOrig;
            let startIndex = answer.indexOf(answerPrepend);
            answer = answer.substring(startIndex + answerPrepend.length);
            let endIndex = answer.indexOf(answerAppend); 
            answer = answer.substring(0, endIndex);
            answerOrig = answerOrig.replace(answerPrepend + answer + answerAppend, "");
            answer = answer.replace(spaceBad, spaceGood);

            if (answer.charAt(0) === "q" && answer.charAt(1) === "=") {
                answer = answerPrepend + answer;
                console.log("* " + answer);
                photoPaths.push(answer);
            }
        }

        if (photoPaths.length > 0) {
            const urlIndex = parseInt(Math.random() * photoPaths.length);
            const queryIndex = Math.min(Math.max(queryCounter-1, 0), query.length-1);

            const message = {
                "url": photoPaths[urlIndex],
                "query": query[queryIndex]
            }
            io.emit("newImage", message);        
        } 
    }
}

setInterval(function() {
    doSearch(query[queryCounter]);
    queryCounter++;
    if (queryCounter > query.length - 1) queryCounter = 0;
}, updateIntervalBase + (query[queryCounter].length * updateIntervalAdjustment));