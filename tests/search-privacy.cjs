// Wire-level regression: real extension, throwaway profile, synthetic cookies, local HTTPS server.
const { chromium } = require('playwright'); const https = require('node:https'); const fs = require('node:fs'); const os = require('node:os'); const path = require('node:path'); const assert = require('node:assert/strict'); const { execFileSync } = require('node:child_process');
const root = path.join(__dirname, '..'), temp = fs.mkdtempSync(path.join(os.tmpdir(), 'bili-focus-privacy-'));
let context, server;
(async () => {
  execFileSync('openssl', ['req','-x509','-newkey','rsa:2048','-nodes','-keyout',path.join(temp,'key.pem'),'-out',path.join(temp,'cert.pem'),'-days','1','-subj','/CN=*.bilibili.com'], {stdio:'ignore'});
  const requests = [];
  server = https.createServer({ key: fs.readFileSync(path.join(temp,'key.pem')), cert: fs.readFileSync(path.join(temp,'cert.pem')) }, (req,res) => {
    requests.push({ url: req.url, host: req.headers.host, cookie: req.headers.cookie || '' });
    res.setHeader('Content-Type','text/html; charset=utf-8'); res.end('<!doctype html><meta charset="utf-8"><title>Local network fixture</title>');
  });
  await new Promise(resolve => server.listen(0,'127.0.0.1',resolve)); const port = server.address().port;
  context = await chromium.launchPersistentContext(path.join(temp,'profile'), { channel:'chromium', headless:true, ignoreHTTPSErrors:true,
    args:[`--disable-extensions-except=${root}`,`--load-extension=${root}`,'--no-proxy-server','--host-resolver-rules=MAP api.bilibili.com 127.0.0.1, MAP search.bilibili.com 127.0.0.1, MAP www.bilibili.com 127.0.0.1'] });
  const worker = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker');
  assert.deepEqual(await worker.evaluate(()=>chrome.declarativeNetRequest.getEnabledRulesets()),['search_privacy']);
  await context.addCookies([{name:'focus_test',value:'synthetic-only',domain:'.bilibili.com',path:'/',secure:true,sameSite:'Lax'}]);
  async function visit(host, route) {
    const page = await context.newPage(); await page.goto(`https://${host}:${port}${route}`); await page.close();
    return requests.findLast(item => item.host === `${host}:${port}` && item.url === route);
  }
  assert.equal((await visit('search.bilibili.com','/video?keyword=math')).cookie,'');
  assert.equal((await visit('api.bilibili.com','/x/web-interface/wbi/search/type?search_type=video&keyword=math')).cookie,'');
  assert.match((await visit('api.bilibili.com','/x/web-interface/nav')).cookie,/focus_test=synthetic-only/);
  assert.match((await visit('www.bilibili.com','/video/BV1GJ411x7h7/')).cookie,/focus_test=synthetic-only/);
  const page = await context.newPage(); await page.goto(`https://search.bilibili.com:${port}/video?keyword=math`);
  await page.evaluate(port=>fetch(`https://api.bilibili.com:${port}/x/web-interface/nav?fromSearch=1`,{credentials:'include',mode:'no-cors'}).then(()=>{}),port);
  assert.equal(requests.findLast(item=>item.url==='/x/web-interface/nav?fromSearch=1').cookie,'');
  console.log('Wire-level privacy passed: search page/API/search-origin requests carry no Cookie; account and playback requests retain login cookies.');
})().catch(error=>{console.error(error);process.exitCode=1}).finally(async()=>{await context?.close();if(server)await new Promise(resolve=>server.close(resolve));fs.rmSync(temp,{recursive:true,force:true});});
