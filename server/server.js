import express from "express";
import * as url from "url";
import * as util from "util";
import * as path from "path";
import axios from "axios";
import { v4 as uuid } from "uuid";
import template from "./template";
import readline from "readline";

// Importing here causes "pirate" to try to load html2canvas, which fails because there's no "window" object, so just hardcoded the only enum we use, IMPLICIT=1
//import {GVAuthType, GVDebug, GVService, GVPlatform, IGVClientCredentialsAuthConfig, IGVImplicitAuthConfig} from "grassvalley";

const HOST = process.env.HOST;
const PORT = process.env.PORT;
const apiKey = process.env.GVApiKey;
const publicUri = process.env.GVPublicUri;
const platformUri = process.env.GVPlatformUri;
const namespace = process.env.GVNamespace;
const proxyPath = namespace
    ? `/${namespace}${process.env.ProxyPath}`
    : process.env.ProxyPath;
const serviceUuid = uuid();
console.log(
    "apiKey: " +
        apiKey +
        "; publicUri: " +
        publicUri +
        "; platformUri: " +
        platformUri +
        "; namespace: " +
        namespace
);
const clientId = Buffer.from(apiKey, "base64")
    .toString()
    .split(":")[0];
const baseUri = new url.URL(publicUri).origin;

const frontendConfig /*: IGVImplicitAuthConfig */ = {
    auth: 1, // GVAuthType.IMPLICIT,
    baseUri,
    clientId,
    platformUri,
    publicUri,
    namespace,
    proxyPath,
    scopes: ["platform"]
};

let serviceId;
let serviceSecret;
let token;
let interval;

const client = axios.create({
    baseURL: platformUri
});

let registerOk, registerFail;
let listenOk;
const registeredPromise = new Promise((resolve, reject) => {
    registerOk = resolve;
    registerFail = reject;
});
const listeningPromise = new Promise((resolve, reject) => {
    listenOk = resolve;
});

const setup = () => {
    client
        .request({
            method: "POST",
            url: "/identity/connect/token",
            headers: {
                Authorization: "Basic " + apiKey,
                "Content-Type": "application/x-www-form-urlencoded"
            },
            data: "grant_type=client_credentials&scope=platform"
        })
        .then(res => {
            console.log("Got access token");

            token = res.data.access_token;
            Object.assign(client.defaults, {
                headers: { Authorization: "Bearer " + token }
            });

            console.log("Registering service");
            return client
                .request({
                    method: "post",
                    url: "/discovery/api/v1/service",
                    data: {
                        serviceId: serviceUuid,
                        serviceType: "GangedChannelsUi",
                        serviceInstance: `channel-ganging-${namespace}`,
                        serviceAddress: HOST,
                        servicePort: PORT,
                        reverseProxyPathRule: proxyPath,
                        serviceTags: ["version=1.0.0", "x=y"],
                        serviceHealth: {
                            health: "OK",
                            healthText: "Service is healthy"
                        }
                    }
                })
                .then(res => {
                    if (res) {
                        console.log(res.data);
                        serviceId = res.data.serviceId;
                        serviceSecret = res.data.serviceSecret;
                        registerOk();
                        interval = setInterval(() => {
                            client
                                .request({
                                    method: "put",
                                    url: `/discovery/api/v1/service/${serviceId}/${serviceSecret}/health`,
                                    headers: {
                                        Authorization: "Bearer " + token
                                    },
                                    data: {
                                        health: "OK",
                                        healthText: "Service is healthy"
                                    }
                                })
                                .catch(err => {
                                    clearInterval(interval);
                                    serviceId = null;
                                    serviceSecret = null;
                                    console.error(
                                        "ERROR",
                                        err.response
                                            ? {
                                                  status: err.response.status,
                                                  text: err.response.statusText
                                              }
                                            : err
                                    );
                                    setup();
                                });
                        }, 10000);
                    }
                })
                .catch(err => {
                    console.log("Registration failed", err);
                    registerFail(err);
                });
        })
        .catch(err => {
            console.error("TOKEN ERROR", err);
            clearInterval(interval);
            setup();
        });
};

setup();

const app = express();
let staticPath = path.join(__dirname, "../dist/");

console.log(`Web app path is ${proxyPath}`);

app.use(proxyPath, express.static("dist"));

app.use(proxyPath + "/refresh", function(req, res) {
    res.sendFile(path.join(staticPath, "/refresh.html"));
});

app.use("*", function(req, res) {
    //console.log("Wildcard handler: " + req.url);
    res.send(
        template(
            "Web UI",
            util.inspect(frontendConfig, null, null),
            baseUri + proxyPath + "/"
        )
    );
});

var server = app.listen(PORT, () => {
    console.log(`Listening on ${PORT}`);
    listenOk();
});

// Rarely works because npm or babel-node are catching the signals...
process.on("SIGTERM", () => {
    tidyUp(os.constants.signals.SIGTERM);
});
process.on("SIGINT", () => {
    tidyUp(os.constants.signals.SIGINT);
});
function tidyUp(code) {
    if (serviceId) {
        console.log("Unregistering service...");
        setTimeout(() => {
            console.error("Timed out cleaning up service");
            process.exit(code);
        }, 2000);
        client
            .request({
                method: "delete",
                url: `/discovery/api/v1/service/${serviceId}/${serviceSecret}`,
                headers: {
                    Authorization: "Bearer " + token,
                    "Content-Type": "application/x-www-form-urlencoded"
                },
                data: "grant_type=client_credentials&scope=platform"
            })
            .then(res => {
                console.log("Unregistered ok");
                process.exit(code);
            })
            .catch(err => {
                console.error(err);
                process.exit(code);
            });
    } else {
        process.exit(code);
    }
}

Promise.all([registeredPromise, listeningPromise])
    .then(() => {
        console.log(
            "\nPlease wait for routing to be effective and then visit:"
        );
        console.log(`${baseUri + proxyPath}`);
        console.log("\nPress RETURN to exit");
    })
    .catch(err => {
        console.log("Startup failed", err);
    });

console.log("Press RETURN to exit");
var rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: false
});
rl.on("line", function terminater() {
    rl.off("line", terminater);
    console.log("Closing server...");
    server.close();
    tidyUp(0);
});
