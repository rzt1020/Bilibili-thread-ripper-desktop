#!/usr/bin/env node
"use strict";
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const {spawnSync} = require("node:child_process");
const {Asar,sha} = require("../tools/asar.cjs");
const {inspect,patch,headerHash} = require("./port.cjs");

function run(command,args,options={}) {
  const result = spawnSync(command,args,{encoding:"utf8",maxBuffer:4*1024*1024,...options});
  if (result.error || result.status !== 0) throw Error(`${path.basename(command)} 失败：${result.error?.message || result.stderr?.trim() || result.stdout?.trim() || result.status}`);
  return result.stdout;
}
function appPaths(app) {
  if (path.extname(app) !== ".app" || !fs.statSync(app).isDirectory()) throw Error("请选择 .app 客户端");
  return {asar:path.join(app,"Contents/Resources/app.asar"),plist:path.join(app,"Contents/Info.plist")};
}
function installed(app) {
  const {asar,plist}=appPaths(app);
  if (!fs.existsSync(asar) || !fs.existsSync(plist)) throw Error("客户端结构不完整");
  const bytes=fs.readFileSync(asar);
  const info=inspect(bytes);
  const marker=info.installed ? JSON.parse(info.asar.text("btr-desktop/installed.json")) : null;
  return {info,marker,asar,plist,bytes};
}
function ensureSource(source) {
  const data=installed(source);
  if (data.marker) throw Error("源客户端已有 BTR，请选择未修改的官方客户端");
  run("/usr/bin/codesign",["--verify","--deep","--strict",source]);
  return data;
}
function sign(app) {
  const {asar,plist}=appPaths(app);
  const digest=headerHash(fs.readFileSync(asar));
  run("/usr/libexec/PlistBuddy",["-c",`Set :ElectronAsarIntegrity:Resources/app.asar:hash ${digest}`,plist]);
  const check=run("/usr/libexec/PlistBuddy",["-c","Print :ElectronAsarIntegrity:Resources/app.asar:hash",plist]).trim();
  if (check !== digest) throw Error("ASAR 完整性记录校验失败");
  // Re-sign nested Electron code and the outer app with one local identity.
  // Keep each component's entitlements. Hardened runtime library validation rejects
  // an ad-hoc main executable loading an ad-hoc framework with no Team ID.
  run("/usr/bin/codesign",["--force","--deep","--sign","-","--preserve-metadata=entitlements",app]);
  run("/usr/bin/codesign",["--verify","--deep","--strict",app]);
}
function install(source,dest) {
  const origin=ensureSource(source);
  if (path.resolve(source)===path.resolve(dest)) throw Error("目标不能覆盖官方客户端");
  if (fs.existsSync(dest)) throw Error(`目标已存在：${dest}。先执行 remove，或指定另一个目标路径。`);
  fs.mkdirSync(path.dirname(dest),{recursive:true});
  const stage=path.join(path.dirname(dest),`.btr-stage-${process.pid}.app`);
  if (fs.existsSync(stage)) throw Error("临时目录已存在，请稍后重试");
  try {
    run("/usr/bin/ditto",[source,stage]);
    const current=installed(stage);
    if (sha(current.bytes)!==sha(origin.bytes)) throw Error("客户端复制校验失败");
    const result=patch(current.bytes);
    fs.writeFileSync(current.asar,result.bytes);
    sign(stage);
    // The official download's quarantine marker must not be copied onto this
    // newly built, locally signed app. Keep the original app's marker untouched.
    run("/usr/bin/xattr",["-dr","com.apple.quarantine",stage]);
    const verified=installed(stage);
    if (verified.marker?.platform!=="darwin" || verified.marker.payloadSha256!==result.payloadSha256) throw Error("安装后验证失败");
    fs.renameSync(stage,dest);
    return {state:"installed",app:dest,clientVersion:result.clientVersion,payloadSha256:result.payloadSha256};
  } finally {if(fs.existsSync(stage))fs.rmSync(stage,{recursive:true,force:true});}
}
function remove(dest) {
  const data=installed(dest);
  if (data.marker?.platform!=="darwin" || !/^[a-f0-9]{64}$/.test(data.marker.originalSha256)) throw Error("不是由 BTR macOS 安装的应用，拒绝删除");
  if (path.resolve(dest)==="/Applications/哔哩哔哩.app") throw Error("拒绝删除官方客户端");
  fs.rmSync(dest,{recursive:true});
  return {state:"removed",app:dest};
}
function status(dest) {
  const data=installed(dest);
  return {state:data.marker?.platform==="darwin"?"installed":"official",app:dest,clientVersion:data.info.version,payloadSha256:data.marker?.payloadSha256 || null,signatureValid:spawnSync("/usr/bin/codesign",["--verify","--deep","--strict",dest]).status===0};
}
if (require.main===module) {
  try {
    if (process.platform!=="darwin") throw Error("安装工具只支持 macOS");
    const action=process.argv[2] || "status";
    const source=path.resolve(process.argv[3] || "/Applications/哔哩哔哩.app");
    const dest=path.resolve(process.argv[action==="install"?4:3] || path.join(os.homedir(),"Applications/哔哩哔哩 BTR.app"));
    const result=action==="install"?install(source,dest):action==="remove"?remove(dest):action==="status"?status(dest):null;
    if (!result) throw Error("用法：node macos/cli.cjs install [官方.app] [BTR.app] | status [BTR.app] | remove [BTR.app]");
    console.log(JSON.stringify(result,null,2));
  } catch(error) {console.error(error.message);process.exitCode=1;}
}
module.exports={install,remove,status};
