
const fs = require("fs");
const path = require("path");
const { spawn, exec } = require("child_process");
const crypto = require("crypto");
const https = require("https");
const os = require("os");

// Environment variables
const DOMAIN = process.env.DOMAIN || "vevc.github.com";
const PORT = process.env.PORT || 10008;
const UUID = process.env.UUID || crypto.randomUUID();
const ARGO_TOKEN = process.env.ARGO_TOKEN || "";
const REMARKS_PREFIX = process.env.REMARKS_PREFIX || "vevc";

// Constants
const XRAY_VERSION = "1.8.10";
const ARGO_VERSION = "2024.5.0";
const ARCH = os.arch() === "arm64" ? "arm64" : "amd64";
const XRAY_ARCH = ARCH === "arm64" ? "arm64-v8a" : "64";
const BASE_DIR = "/home/container";
const BIN_DIR = path.join(BASE_DIR, "bin");

let ARGO_DOMAIN = "xxx.trycloudflare.com";
let SHORT_ID = crypto.randomBytes(4).toString("hex");
let PUBLIC_KEY = "";
let SUB_INFO = [];

// App definitions
const apps = [
  {
    name: "cf",
    binaryPath: path.join(BIN_DIR, "cf"),
    url: `https://github.com/cloudflare/cloudflared/releases/download/${ARGO_VERSION}/cloudflared-linux-${ARCH}`,
    args: ARGO_TOKEN
      ? ["tunnel", "--no-autoupdate", "run", "--token", ARGO_TOKEN]
      : ["tunnel", "--no-autoupdate", "--url", `http://localhost:8001`],
    mode: ARGO_TOKEN ? "ignore" : "filter",
    pattern: /https:\/\/[a-z0-9-]+\.trycloudflare\.com/g,
  },
  {
    name: "xy",
    binaryPath: path.join(BIN_DIR, "xy"),
    url: `https://github.com/XTLS/Xray-core/releases/download/v${XRAY_VERSION}/Xray-linux-${XRAY_ARCH}.zip`,
    zip: true,
    args: ["-c", path.join(BASE_DIR, "xy-config.json")],
    mode: "ignore",
  },
];

// Helper functions
const download = (url, dest, zip = false) => {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      const fileStream = fs.createWriteStream(dest);
      res.pipe(fileStream);
      fileStream.on("finish", () => {
        fileStream.close();
        if (zip) {
          exec(`unzip -o ${dest} -d ${path.dirname(dest)}`, (err) => {
            if (err) return reject(err);
            fs.unlinkSync(dest);
            fs.renameSync(path.join(path.dirname(dest), "xray"), dest);
            fs.chmodSync(dest, "755");
            resolve();
          });
        } else {
          fs.chmodSync(dest, "755");
          resolve();
        }
      });
    }).on("error", (err) => reject(err));
  });
};

const generateXrayConfig = (privateKey) => {
  return {
    inbounds: [
      {
        port: 8001,
        protocol: "vless",
        settings: {
          clients: [{ id: UUID }],
          decryption: "none",
        },
        streamSettings: {
          network: "ws",
          wsSettings: {
            path: "/?ed=2560",
          },
        },
      },
      {
        port: PORT,
        protocol: "vless",
        settings: {
          clients: [{ id: UUID }],
          decryption: "none",
        },
        streamSettings: {
          network: "tcp",
          security: "reality",
          realitySettings: {
            show: false,
            dest: "www.iq.com:443",
            xver: 0,
            serverNames: ["www.iq.com"],
            privateKey: privateKey,
            shortIds: [SHORT_ID],
          },
        },
      },
    ],
    outbounds: [
      {
        protocol: "freedom",
        settings: {},
      },
    ],
  };
};

const printSubInfo = () => {
  SUB_INFO = [
    `vless://${UUID}@${ARGO_DOMAIN}:443?encryption=none&security=tls&sni=${ARGO_DOMAIN}&fp=chrome&type=ws&path=%2F%3Fed%3D2560#${REMARKS_PREFIX}-ws-argo`,
    `vless://${UUID}@${DOMAIN}:${PORT}?encryption=none&flow=xtls-rprx-vision&security=reality&sni=www.cloudflare.com&fp=chrome&pbk=${PUBLIC_KEY}&sid=${SHORT_ID}&spx=%2F&type=tcp&headerType=none#${REMARKS_PREFIX}-reality`,
  ];
  const subInfoStr = SUB_INFO.join("\\n");
  console.log(`
============================================================
🚀 WebSocket+Argo & Reality Node Info
------------------------------------------------------------
${subInfoStr}
============================================================`);
  fs.writeFileSync(path.join(BASE_DIR, "node.txt"), subInfoStr);
};

const runProcess = (app) => {
  const child = spawn(app.binaryPath, app.args, {
    stdio: app.mode === "filter" ? ["ignore", "pipe", "pipe"] : app.mode,
  });

  if (app.mode === "filter") {
    const handleData = (data) => {
      const logText = data.toString();
      const matches = logText.match(app.pattern);
      if (matches && matches.length > 0) {
        child.stdout.off("data", handleData);
        child.stderr.off("data", handleData);
        ARGO_DOMAIN = new URL(matches[matches.length - 1]).hostname;
        printSubInfo();
      }
    };
    child.stdout.on("data", handleData);
    child.stderr.on("data", handleData);
  }

  child.on("exit", (code) => {
    console.log(`[EXIT] ${app.name} exited with code: ${code}`);
    console.log(`[RESTART] Restarting ${app.name}...`);
    setTimeout(() => runProcess(app), 3000);
  });
};

const main = async () => {
  try {
    fs.mkdirSync(BIN_DIR, { recursive: true });

    for (const app of apps) {
      if (!fs.existsSync(app.binaryPath)) {
        console.log(`[DOWNLOAD] Downloading ${app.name}...`);
        await download(app.url, app.binaryPath, app.zip);
      }
    }

    const keyPairOutput = await new Promise((resolve, reject) => {
      exec(`${apps[1].binaryPath} x25519`, (err, stdout) => {
        if (err) return reject(err);
        resolve(stdout);
      });
    });

    const privateKey = keyPairOutput.match(/PrivateKey:\s(\S+)/)[1];
    PUBLIC_KEY = keyPairOutput.match(/PublicKey:\s(\S+)/)[1];
    const xrayConfig = generateXrayConfig(privateKey);
    fs.writeFileSync(path.join(BASE_DIR, "xy-config.json"), JSON.stringify(xrayConfig, null, 2));

    printSubInfo();

    for (const app of apps) {
      runProcess(app);
    }
  } catch (err) {
    console.error("[ERROR] Startup failed:", err);
    process.exit(1);
  }
};

main();
