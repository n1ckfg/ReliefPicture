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
