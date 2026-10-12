"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const {Asar,sha} = require("../tools/asar.cjs");
const {bundle,patch,inspect,headerHash} = require("../macos/port.cjs");

function fixture() {
  const json = Buffer.from('{"files":{}}'), padded = Math.ceil((json.length+4)/4)*4;
  const bytes = Buffer.alloc(padded+12);
  bytes.writeUInt32LE(4,0); bytes.writeUInt32LE(padded+4,4);
  bytes.writeUInt32LE(padded,8); bytes.writeUInt32LE(json.length,12); json.copy(bytes,16);
  const asar = new Asar(bytes);
  asar.set("package.json",JSON.stringify({name:"bilibili",version:"1.17.3",main:"main/index.js"}));
  asar.set("main/index.js",'"use strict";\noriginal();');
  return asar.pack();
}

test("macOS patch injects a relative bootstrap and preserves the official entry", () => {
  const original=fixture(), result=patch(original), asar=new Asar(result.bytes);
  assert.equal(inspect(original).installed,false);
  assert.equal(inspect(result.bytes).installed,true);
  assert.match(asar.text("main/index.js"),/^"use strict";\ntry\{require\("\.\.\/btr-desktop\/bootstrap\.cjs"\)/);
  assert.match(asar.text("main/index.js"),/original\(\);$/);
  assert.equal(asar.text("btr-desktop/installed.json").includes(sha(original)),true);
  assert.equal(asar.read("btr-desktop/desktop.js").equals(bundle()),true);
  assert.match(headerHash(result.bytes),/^[a-f0-9]{64}$/);
  assert.throws(()=>patch(result.bytes),/已包含 BTR/);
});

test("macOS bundle has transport and settings without the Windows maintenance bridge", () => {
  const code=bundle().toString();
  assert.match(code,/__BTR_PLATFORM__="darwin"/);
  assert.match(code,/api\.transport/);
  assert.doesNotMatch(code,/__BTR_DESKTOP_UPDATE__/);
  new Function(code);
});
