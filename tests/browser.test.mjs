/** Local Edge integration checks. Uses synthetic Telegram APIs; never contacts a bot. */
import {spawn} from 'node:child_process';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import assert from 'node:assert/strict';
import {demoSnapshot} from '../core.mjs';

const base=process.argv[2]||'http://127.0.0.1:8765';
const output=resolve('.cache/exports/miniapp-previews');
const profile=resolve(`.cache/miniapp-browser-${Date.now()}`);
await mkdir(output,{recursive:true});
const edge=spawn('C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',[
  '--headless','--disable-gpu','--no-first-run','--disable-background-networking',
  `--user-data-dir=${profile}`,'--remote-debugging-port=0','about:blank'
],{stdio:'ignore',windowsHide:true});
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
let ws,seq=0,waiting=new Map(),errors=[];
try {
  let port;
  for(let i=0;i<100;i++) {
    try {port=Number((await readFile(resolve(profile,'DevToolsActivePort'),'utf8')).split('\n')[0]);break;} catch {await delay(100);}
  }
  assert.ok(port,'Edge debugging endpoint did not start');
  const pages=await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  ws=new WebSocket(pages.find(p=>p.type==='page').webSocketDebuggerUrl);
  await new Promise((resolve,reject)=>{ws.onopen=resolve;ws.onerror=reject;});
  ws.onmessage=e=>{
    const m=JSON.parse(e.data);
    if(m.id) {const p=waiting.get(m.id);waiting.delete(m.id);m.error?p.reject(Error(m.error.message)):p.resolve(m.result);}
    else if(m.method==='Runtime.exceptionThrown') errors.push(m.params.exceptionDetails.text);
  };
  function call(method,params={}) {
    return new Promise((resolve,reject)=>{const id=++seq;waiting.set(id,{resolve,reject});ws.send(JSON.stringify({id,method,params}));});
  }
  async function evaluate(expression) {
    const result=await call('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});
    assert.ok(!result.exceptionDetails,JSON.stringify(result.exceptionDetails));
    return result.result.value;
  }
  let injection;
  async function open(path,{theme='dark',initData='',platform='tdesktop',width=390,history=false}={}) {
    if(injection) await call('Page.removeScriptToEvaluateOnNewDocument',{identifier:injection});
    const source=`window.__sent=[];window.__fetch=[];window.Telegram={WebApp:{platform:${JSON.stringify(platform)},colorScheme:${JSON.stringify(theme)},initData:${JSON.stringify(initData)},ready(){},expand(){},onEvent(){},sendData(data){window.__sent.push(data)}}};`+
      (history?`window.VODAS_CONFIG={historyApi:'https://history.example/history',deviceId:'VODAS-TEST'};window.fetch=async(url,options)=>{window.__fetch.push({url:String(url),headers:options.headers});return new Response(JSON.stringify({device_id:'VODAS-TEST',vid:'BUS-01',items:[{event_id:1,type:'notice',reason:'manual_photo',ts:1792550000,ai_class:1,ai_conf:94}],next_cursor:null}),{status:200})};`:'');
    injection=(await call('Page.addScriptToEvaluateOnNewDocument',{source})).identifier;
    if(history) await call('Fetch.enable',{patterns:[{urlPattern:'*/config.js'}]});
    else await call('Fetch.disable');
    await call('Emulation.setDeviceMetricsOverride',{width,height:1050,deviceScaleFactor:1,mobile:true});
    errors=[];
    await call('Page.navigate',{url:base+path});
    for(let i=0;i<80;i++) {
      if(await evaluate(`!!document.getElementById('notice') && (document.getElementById('control').hidden===false || document.getElementById('history').hidden===false || document.getElementById('notice').hidden===false)`)) break;
      await delay(75);
    }
    await delay(120);
    assert.equal(await evaluate('document.documentElement.scrollWidth<=window.innerWidth'),true,'horizontal overflow');
    assert.deepEqual(errors,[],'uncaught browser error');
  }
  // config.js is the public build setting. Intercept it locally for the authenticated history scenario.
  ws.addEventListener('message',e=>{
    const m=JSON.parse(e.data);
    if(m.method==='Fetch.requestPaused') call('Fetch.fulfillRequest',{requestId:m.params.requestId,responseCode:200,responseHeaders:[{name:'Content-Type',value:'application/javascript'}],body:Buffer.from("window.VODAS_CONFIG={historyApi:'https://history.example/history',deviceId:'VODAS-TEST'};").toString('base64')});
  });
  await call('Page.enable');await call('Runtime.enable');
  for(const [scenario,theme,width] of [['normal','dark',390],['alert','light',390],['unknown','dark',320],['stale','light',390],['history','dark',390]]) {
    await open(`/control.html?demo=${scenario}`,{theme,width});
    if(scenario==='stale') assert.equal(await evaluate(`document.querySelector('[data-op="photo"]').disabled`),true);
    if(scenario==='alert') {
      assert.equal(await evaluate(`document.getElementById('ack').hidden`),false);
      await evaluate(`document.getElementById('ack').click();document.getElementById('proceed').click()`);
      assert.equal(await evaluate('window.__sent.length'),0,'demo sent a vehicle command');
    }
    const capture=await call('Page.captureScreenshot',{format:'png',captureBeyondViewport:true});
    await writeFile(resolve(output,`${scenario}-${theme}-${width}.png`),Buffer.from(capture.data,'base64'));
  }
  const snapshot=Buffer.from(JSON.stringify(demoSnapshot('normal'))).toString('base64url');
  await open(`/control.html?s=${snapshot}`);
  await evaluate(`document.querySelector('[data-op="photo"]').click()`);
  assert.equal(await evaluate(`document.getElementById('confirm').open`),true);
  assert.equal(await evaluate('window.__sent.length'),0,'write bypassed confirmation');
  await evaluate(`document.getElementById('cancel').click()`);
  assert.equal(await evaluate('window.__sent.length'),0);
  await evaluate(`document.querySelector('[data-op="photo"]').click();document.getElementById('proceed').click();document.querySelector('[data-op="r"]').click()`);
  assert.equal(await evaluate('window.__sent.length'),1,'more than one command sent from one page');
  assert.match(await evaluate('window.__sent[0]'),/^v1 [a-f0-9]{8} [a-f0-9]{16} [0-9]+ photo$/);
  assert.equal(await evaluate('location.search'),'','snapshot remained in browser URL');
  await open(`/control.html?s=${snapshot}`,{initData:'menu-session'});
  await evaluate(`document.querySelector('[data-op="r"]').click()`);
  assert.equal(await evaluate('window.__sent.length'),0,'Menu sent a keyboard command');
  await open('/history.html',{initData:'signed-session'});
  assert.equal(await evaluate('window.__fetch.length'),0);
  assert.match(await evaluate(`document.getElementById('notice').textContent`),/History is not configured/);
  for(const [width,theme] of [[320,'dark'],[390,'light']]) {
    await open('/control.html?demo=normal',{width,theme});
    for(const view of ['device','contacts']) {
      await evaluate(`document.querySelector('[data-view="${view}"]').click()`);
      assert.equal(await evaluate('document.documentElement.scrollWidth<=window.innerWidth'),true,`${view} overflow`);
      const capture=await call('Page.captureScreenshot',{format:'png',captureBeyondViewport:true});
      await writeFile(resolve(output,`${view}-${theme}-${width}.png`),Buffer.from(capture.data,'base64'));
    }
  }
  await open(`/control.html?s=${snapshot}`);
  await evaluate(`document.querySelector('[data-view="device"]').click();document.getElementById('profileInput').value='24';document.getElementById('profileForm').requestSubmit()`);
  assert.equal(await evaluate(`document.getElementById('confirm').open`),true);
  assert.equal(await evaluate('window.__sent.length'),0);
  await evaluate(`document.getElementById('cancel').click()`);
  assert.equal(await evaluate('window.__sent.length'),0);
  await evaluate(`document.getElementById('profileForm').requestSubmit();document.getElementById('proceed').click()`);
  assert.match(await evaluate('window.__sent[0]'),/ cfg vprofile=24$/);
  assert.equal(await evaluate(`document.querySelector('#thresholdForm button').disabled`),true);
  await open(`/control.html?s=${snapshot}`);
  await evaluate(`document.querySelector('[data-view="contacts"]').click();document.getElementById('contactName').value='Hà';document.getElementById('contactPhone').value='0912345678';document.getElementById('contactForm').requestSubmit()`);
  assert.equal(await evaluate('window.__sent.length'),0);
  await evaluate(`document.getElementById('proceed').click()`);
  assert.match(await evaluate('window.__sent[0]'),/ contact 2,0,0912345678,SMOg$/);
  const driverSnapshot=Buffer.from(JSON.stringify({...demoSnapshot(),role:2})).toString('base64url');
  await open(`/control.html?s=${driverSnapshot}`);
  assert.equal(await evaluate(`document.querySelector('#profileForm button').disabled`),true);
  assert.equal(await evaluate(`document.querySelector('.owner-editor').hidden`),true);
  const standby=Buffer.from(JSON.stringify({...demoSnapshot(),fsm:7})).toString('base64url');
  await open(`/control.html?s=${standby}`);
  await evaluate(`document.querySelector('[data-view="device"]').click();document.querySelector('[data-op="buzz"]').click();document.getElementById('proceed').click()`);
  assert.match(await evaluate('window.__sent[0]'),/ buzz$/);
  await open('/control.html?s=bad');
  assert.equal(await evaluate(`document.getElementById('control').hidden`),true);
  console.log('Browser integration passed: responsive vehicle panels, owner/driver permissions, profile save, contact UTF-8, diagnostics confirmation, stale state, demo isolation, one send and history disabled.');
  console.log(`Screenshots: ${output}`);
  await call('Browser.close');
} finally {
  ws?.close();edge.kill();
}
