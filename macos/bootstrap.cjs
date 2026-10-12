"use strict";
const { app, session } = require("electron");
const path = require("path");
const fs = require("fs");
const preload = path.join(__dirname, "preload.cjs");
const bundle = fs.readFileSync(path.join(__dirname, "desktop.js"), "utf8");

function attach(target) {
  try {
    const existing = target.getPreloads();
    if (!existing.includes(preload)) target.setPreloads([...existing, preload]);
  } catch (error) { console.error("BTR macOS preload:", error.message); }
}

app.on("session-created", attach);
app.whenReady().then(() => attach(session.defaultSession)).catch(error => console.error("BTR macOS preload:", error.message));

// The first macOS main window may initialize before a session preload takes effect.
// Mount settings after its document loads; the player still uses the early preload.
app.on("web-contents-created", (_event, contents) => {
  contents.on("did-finish-load", () => {
    let url;
    try { url = new URL(contents.getURL()); } catch (_) { return; }
    if (url.origin !== "https://bilipc.bilibili.com" || url.pathname !== "/index.html") return;
    contents.executeJavaScript(`if (!globalThis.__BTR_DESKTOP__) { ${bundle}\n }`).catch(error => console.error("BTR macOS settings:", error.message));
  });
});
