"use strict";
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const {Asar, sha} = require("../tools/asar.cjs");
const project = path.resolve(__dirname, "..");
const files = [
  "shared/range-core.js", "shared/cdn-resolver.js", "shared/idm-downloader.js",
  "shared/runtime-notices.js", "shared/notification-view.js", "src/settings.js",
  "src/transport.js", "src/client.js", "src/settings-view.js", "src/player-settings.js"
];
function prefix(main) {
  const relative = path.posix.relative(path.posix.dirname(main),"btr-desktop/bootstrap.cjs");
  return `try{require(${JSON.stringify(relative.startsWith(".")?relative:`./${relative}`)})}catch(error){console.error("BTR macOS bootstrap:",error&&error.message)}\n`;
}

function bundle() {
  const config = JSON.parse(fs.readFileSync(path.join(project, "desktop.json")));
  return Buffer.from(`globalThis.__BTR_PLATFORM__="darwin";\nglobalThis.__BTR_DESKTOP_RELEASE__=${JSON.stringify({version:config.version,adapterRevision:config.adapterRevision})};\n`
    + files.map(file => `\n/* ${file} */\n${fs.readFileSync(path.join(project, file), "utf8")}\n`).join(""));
}

function inspect(bytes) {
  const asar = new Asar(bytes);
  const app = JSON.parse(asar.text("package.json"));
  if (app.name !== "bilibili") throw Error("目标不是官方 Bilibili 客户端");
  const main = String(app.main || "index.js").replace(/^\.\//, "");
  const entry = asar.entry(main);
  if (!/\.c?js$/.test(main) || !entry || entry.files || entry.unpacked || entry.link) throw Error("无法识别客户端 JavaScript 入口");
  return {asar, main, version:app.version, installed:!!asar.entry("btr-desktop/installed.json")};
}

function patch(bytes) {
  const {asar,main,version,installed} = inspect(bytes);
  if (installed) throw Error("源客户端已包含 BTR，请使用未修改的官方客户端");
  const entry = asar.text(main);
  if (entry.includes("btr-desktop/bootstrap.cjs")) throw Error("入口已有 BTR 注入");
  const head = /^\uFEFF?(?:\s*(["'])use strict\1[ \t]*;?[ \t]*(?:\r?\n)?)?/.exec(entry)[0];
  asar.set(main, head + prefix(main) + entry.slice(head.length));
  asar.set("btr-desktop/bootstrap.cjs", fs.readFileSync(path.join(__dirname,"bootstrap.cjs")));
  asar.set("btr-desktop/preload.cjs", fs.readFileSync(path.join(__dirname,"preload.cjs")));
  const payload = bundle();
  asar.set("btr-desktop/desktop.js", payload);
  asar.set("btr-desktop/installed.json", JSON.stringify({platform:"darwin",clientVersion:version,payloadSha256:sha(payload),originalSha256:sha(bytes)}));
  const patched = asar.pack();
  if (sha(new Asar(patched).read("btr-desktop/desktop.js")) !== sha(payload)) throw Error("补丁校验失败");
  return {bytes:patched, clientVersion:version, payloadSha256:sha(payload)};
}

function headerHash(bytes) {
  const size = bytes.readUInt32LE(12);
  return crypto.createHash("sha256").update(bytes.subarray(16,16+size)).digest("hex");
}

module.exports = {bundle,inspect,patch,headerHash};
