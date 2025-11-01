const fs = require("fs");
const fsp = fs.promises;
const path = require("path");
const crypto = require("crypto");
const { spawn } = require("child_process");

const PLACEHOLDER_ARGO = "pending.trycloudflare.com";
const BASE_PATH = process.env.BASE_PATH || "/home/container";
const CF_DIR = process.env.CF_DIR || path.join(BASE_PATH, "cf");
const XRAY_DIR = process.env.XRAY_DIR || path.join(BASE_PATH, "xy");
const META_PATH = process.env.META_FILE || path.join(BASE_PATH, "nodejs-app.json");
const SUBSCRIPTION_FILE = process.env.SUB_FILE || path.join(BASE_PATH, "node.txt");

let meta = {};

const CONFIG = {
  domain: process.env.DOMAIN,
  port: process.env.PORT,
  uuid: process.env.UUID,
  remarksPrefix: process.env.REMARKS_PREFIX,
  argoToken: process.env.ARGO_TOKEN || "",
  argoDomain: process.env.ARGO_DOMAIN,
  privateKey: process.env.PRIVATE_KEY,
  publicKey: process.env.PUBLIC_KEY,
  shortId: process.env.SHORT_ID,
  cfBinaryPath: process.env.CF_BIN || path.join(CF_DIR, "cf"),
  xrayBinaryPath: process.env.XRAY_BIN || path.join(XRAY_DIR, "xy"),
  xrayConfigPath: process.env.XRAY_CONFIG || path.join(XRAY_DIR, "config.json"),
  subscriptionFile: SUBSCRIPTION_FILE
};

function generateUUID() {
  const buf = crypto.randomBytes(16);
  buf[6] = (buf[6] & 0x0f) | 0x40;
  buf[8] = (buf[8] & 0x3f) | 0x80;
  const hex = buf.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function toPositiveInteger(value, fallback) {
  const num = Number(value);
  return Number.isFinite(num) && num > 0 ? Math.floor(num) : fallback;
}

async function loadMeta() {
  try {
    const data = await fsp.readFile(META_PATH, "utf8");
    meta = JSON.parse(data);
  } catch (err) {
    if (err.code !== "ENOENT") {
      console.warn(`[警告] 无法读取元数据文件: ${err.message}`);
    }
    meta = {};
  }
}

function applyDefaults() {
  CONFIG.domain = CONFIG.domain || meta.domain || "example.com";
  CONFIG.port = toPositiveInteger(CONFIG.port, toPositiveInteger(meta.port, 10008));
  CONFIG.uuid = CONFIG.uuid || meta.uuid || generateUUID();
  CONFIG.remarksPrefix = CONFIG.remarksPrefix || meta.remarksPrefix || "nodejs-app";
  CONFIG.privateKey = CONFIG.privateKey || meta.privateKey || "";
  CONFIG.publicKey = CONFIG.publicKey || meta.publicKey || "";
  CONFIG.shortId = CONFIG.shortId || meta.shortId || "";
  CONFIG.argoDomain = CONFIG.argoDomain || meta.argoDomain || PLACEHOLDER_ARGO;
}

async function ensureDirectories() {
  await fsp.mkdir(BASE_PATH, { recursive: true });
  await fsp.mkdir(CF_DIR, { recursive: true });
  await fsp.mkdir(XRAY_DIR, { recursive: true });
  await fsp.mkdir(path.dirname(CONFIG.subscriptionFile), { recursive: true });
  await fsp.mkdir(path.dirname(META_PATH), { recursive: true });
}

async function ensureExecutable(filePath, label) {
  try {
    await fsp.access(filePath, fs.constants.X_OK);
  } catch (err) {
    throw new Error(`找不到可执行文件 ${label} (${filePath})，请确认已经下载并赋予执行权限。`);
  }
}

function parseKeyPair(output) {
  const privateMatch = output.match(/Private(?:\s+key)?:\s*([^\s]+)/i);
  const publicMatch = output.match(/Public(?:\s+key)?:\s*([^\s]+)/i);
  if (!privateMatch || !publicMatch) {
    throw new Error("无法从 xray 输出中解析 Reality 密钥，请确认二进制版本是否支持 x25519 命令。");
  }
  return {
    privateKey: privateMatch[1].trim(),
    publicKey: publicMatch[1].trim()
  };
}

function generateRealityKeyPair() {
  return new Promise((resolve, reject) => {
    const child = spawn(CONFIG.xrayBinaryPath, ["x25519"]);
    let output = "";
    child.stdout.on("data", (chunk) => {
      output += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      output += chunk.toString();
    });
    child.on("error", (err) => {
      reject(new Error(`无法执行 Xray x25519 命令: ${err.message}`));
    });
    child.on("close", (code) => {
      if (code !== 0) {
        return reject(new Error(`Xray x25519 命令执行失败，退出码 ${code}。输出: ${output}`));
      }
      try {
        resolve(parseKeyPair(output));
      } catch (parseErr) {
        reject(parseErr);
      }
    });
  });
}

function derivePublicKeyFromPrivateKey(privateKey) {
  return new Promise((resolve, reject) => {
    const child = spawn(CONFIG.xrayBinaryPath, ["x25519", "-i", privateKey]);
    let output = "";
    child.stdout.on("data", (chunk) => {
      output += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      output += chunk.toString();
    });
    child.on("error", (err) => {
      reject(new Error(`无法执行 Xray x25519 -i 命令: ${err.message}`));
    });
    child.on("close", (code) => {
      if (code !== 0) {
        return reject(new Error(`Xray x25519 -i 命令执行失败，退出码 ${code}。输出: ${output}`));
      }
      try {
        const { publicKey } = parseKeyPair(output);
        resolve(publicKey);
      } catch (parseErr) {
        reject(parseErr);
      }
    });
  });
}

async function ensureRealityKeys() {
  if (CONFIG.privateKey && CONFIG.publicKey) {
    return;
  }
  if (CONFIG.privateKey && !CONFIG.publicKey) {
    try {
      CONFIG.publicKey = await derivePublicKeyFromPrivateKey(CONFIG.privateKey);
      return;
    } catch (err) {
      console.warn(`[警告] 无法根据现有私钥推导公钥: ${err.message}`);
    }
  }
  const pair = await generateRealityKeyPair();
  CONFIG.privateKey = pair.privateKey;
  CONFIG.publicKey = pair.publicKey;
}

function ensureShortId() {
  if (!CONFIG.shortId || typeof CONFIG.shortId !== "string" || CONFIG.shortId.length === 0) {
    CONFIG.shortId = crypto.randomBytes(4).toString("hex");
  }
}

function createXrayConfig() {
  return {
    log: {
      access: "none",
      error: "none",
      loglevel: "none"
    },
    inbounds: [
      {
        listen: null,
        port: 8001,
        protocol: "vless",
        settings: {
          decryption: "none",
          clients: [
            {
              id: CONFIG.uuid,
              flow: "",
              email: "ws-argo"
            }
          ]
        },
        streamSettings: {
          network: "ws",
          security: "none",
          wsSettings: {
            host: "",
            path: "/"
          }
        }
      },
      {
        port: CONFIG.port,
        protocol: "vless",
        settings: {
          clients: [
            {
              id: CONFIG.uuid,
              flow: "xtls-rprx-vision",
              email: "raw-reality"
            }
          ],
          decryption: "none"
        },
        streamSettings: {
          network: "raw",
          security: "reality",
          realitySettings: {
            show: false,
            target: "www.cloudflare.com:443",
            xver: 0,
            serverNames: ["www.cloudflare.com"],
            privateKey: CONFIG.privateKey,
            shortIds: [CONFIG.shortId]
          }
        }
      }
    ],
    outbounds: [
      {
        protocol: "freedom"
      }
    ]
  };
}

async function writeXrayConfig() {
  const configContent = JSON.stringify(createXrayConfig(), null, 2);
  await fsp.writeFile(CONFIG.xrayConfigPath, `${configContent}\n`);
}

function buildSubscriptionLinks() {
  const argoHost = CONFIG.argoDomain && CONFIG.argoDomain.trim().length > 0 ? CONFIG.argoDomain : PLACEHOLDER_ARGO;
  return [
    `vless://${CONFIG.uuid}@${argoHost}:443?encryption=none&security=tls&sni=${argoHost}&fp=chrome&type=ws&path=%2F%3Fed%3D2560#${CONFIG.remarksPrefix}-ws-argo`,
    `vless://${CONFIG.uuid}@${CONFIG.domain}:${CONFIG.port}?encryption=none&flow=xtls-rprx-vision&security=reality&sni=www.cloudflare.com&fp=chrome&pbk=${CONFIG.publicKey}&sid=${CONFIG.shortId}&spx=%2F&type=tcp&headerType=none#${CONFIG.remarksPrefix}-reality`
  ];
}

async function writeSubscriptionFile() {
  const links = buildSubscriptionLinks();
  await fsp.writeFile(CONFIG.subscriptionFile, `${links.join("\n")}\n`);
}

async function persistMeta() {
  const data = {
    ...meta,
    domain: CONFIG.domain,
    port: CONFIG.port,
    uuid: CONFIG.uuid,
    remarksPrefix: CONFIG.remarksPrefix,
    privateKey: CONFIG.privateKey,
    publicKey: CONFIG.publicKey,
    shortId: CONFIG.shortId
  };
  if (CONFIG.argoDomain && CONFIG.argoDomain !== PLACEHOLDER_ARGO) {
    data.argoDomain = CONFIG.argoDomain;
  }
  meta = data;
  await fsp.writeFile(META_PATH, `${JSON.stringify(meta, null, 2)}\n`);
}

async function updateOutputs() {
  await writeSubscriptionFile();
  printSubInfo();
}

function printSubInfo() {
  const links = buildSubscriptionLinks();
  console.log("============================================================");
  console.log("🚀 WebSocket + Argo & Reality 节点信息");
  console.log("------------------------------------------------------------");
  for (const link of links) {
    console.log(link);
  }
  console.log("============================================================");
}

async function updateArgoDomain(hostname) {
  if (!hostname || hostname === CONFIG.argoDomain) {
    return;
  }
  CONFIG.argoDomain = hostname;
  try {
    await persistMeta();
    await updateOutputs();
  } catch (err) {
    console.error(`[错误] 更新 Argo 域名时失败: ${err.message}`);
  }
}

function buildApps() {
  const cfArgs = CONFIG.argoToken
    ? ["tunnel", "--no-autoupdate", "--edge-ip-version", "auto", "--protocol", "http2", "run", "--token", CONFIG.argoToken]
    : ["tunnel", "--no-autoupdate", "--edge-ip-version", "auto", "--protocol", "http2", "--url", "http://localhost:8001"];
  return [
    {
      name: "cloudflared",
      binaryPath: CONFIG.cfBinaryPath,
      args: cfArgs,
      mode: CONFIG.argoToken ? "ignore" : "filter",
      pattern: /https:\/\/[a-z0-9-]+\.trycloudflare\.com/gi
    },
    {
      name: "xray",
      binaryPath: CONFIG.xrayBinaryPath,
      args: ["-c", CONFIG.xrayConfigPath],
      mode: "ignore"
    }
  ];
}

function runProcess(app) {
  const child = spawn(app.binaryPath, app.args, {
    stdio: app.mode === "filter" ? ["ignore", "pipe", "pipe"] : app.mode
  });

  console.log(`[启动] ${app.name} => ${app.binaryPath} ${app.args.join(" ")}`);

  child.on("error", (err) => {
    console.error(`[错误] 无法启动 ${app.name}: ${err.message}`);
  });

  if (app.mode === "filter") {
    const handleData = (data) => {
      const text = data.toString();
      const matches = text.match(app.pattern);
      if (!matches) {
        return;
      }
      const lastUrl = matches[matches.length - 1];
      try {
        const hostname = new URL(lastUrl).hostname;
        updateArgoDomain(hostname);
      } catch (err) {
        console.warn(`[警告] 解析 Argo URL 失败: ${err.message}`);
      }
    };
    child.stdout.on("data", handleData);
    child.stderr.on("data", handleData);
  }

  child.on("exit", (code) => {
    console.log(`[退出] ${app.name} 以状态码 ${code} 结束，3 秒后尝试重启...`);
    setTimeout(() => runProcess(app), 3000);
  });
}

async function bootstrap() {
  await loadMeta();
  applyDefaults();
  await ensureDirectories();

  if (!CONFIG.argoToken && (!CONFIG.argoDomain || CONFIG.argoDomain === PLACEHOLDER_ARGO)) {
    console.log("[提示] 未设置 ARGO_TOKEN，将使用临时隧道域名。");
  }
  if (CONFIG.argoToken && (!CONFIG.argoDomain || CONFIG.argoDomain === PLACEHOLDER_ARGO)) {
    console.warn("[警告] 已提供 ARGO_TOKEN，但缺少 ARGO_DOMAIN，订阅链接将暂时使用占位符。");
  }

  await ensureExecutable(CONFIG.xrayBinaryPath, "Xray");
  await ensureExecutable(CONFIG.cfBinaryPath, "Cloudflared");

  await ensureRealityKeys();
  ensureShortId();
  await persistMeta();
  await writeXrayConfig();
  await updateOutputs();

  const apps = buildApps();
  for (const app of apps) {
    runProcess(app);
  }
}

bootstrap().catch((err) => {
  console.error("[错误] 启动失败:", err.stack || err.message || err);
  process.exit(1);
});
