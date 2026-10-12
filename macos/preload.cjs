"use strict";
(() => {
  if (!process.isMainFrame || location.origin !== "https://bilipc.bilibili.com" || !/^\/(index|player)\.html$/.test(location.pathname)) return;
  const fs = require("fs"), path = require("path");
  const code = fs.readFileSync(path.join(__dirname, "desktop.js"), "utf8");
  let injected = false;
  function inject() {
    if (injected || !document.documentElement) return;
    injected = true;
    observer.disconnect();
    const script = document.createElement("script");
    script.textContent = code;
    (document.head || document.documentElement).appendChild(script);
    script.remove();
  }
  const observer = new MutationObserver(inject);
  observer.observe(document, {childList:true,subtree:true});
  inject();
})();
