import {STATES,parseSnapshot,isFresh,canAct,makeCommand,mapLink,ageText,demoSnapshot} from './core.mjs';
const $=id=>document.getElementById(id);
const params=new URLSearchParams(location.search), scenario=params.get('demo');
const demo=['normal','alert','stale','unknown','busy','history','error'].includes(scenario);
if(!demo&&!window.Telegram?.WebApp) {
  await new Promise(resolve=>{
    const sdk=document.createElement('script'); sdk.src='https://telegram.org/js/telegram-web-app.js';
    const timeout=setTimeout(resolve,8000); sdk.onload=sdk.onerror=()=>{clearTimeout(timeout); resolve();}; document.head.append(sdk);
  });
}
const tg=window.Telegram?.WebApp;
const inTelegram=Boolean(tg && tg.platform && tg.platform!=='unknown');
const historyPage=/history(?:\.html)?\/?$/.test(location.pathname) || scenario==='history';
let snapshot=null, sent=false, pendingAction=null, historyItems=[], cursor=null, photosOnly=false, loading=false;
const started=performance.now();
function notice(text,kind='') { $('notice').textContent=text; $('notice').className=`notice ${kind}`; $('notice').hidden=!text; }
function theme() { document.documentElement.dataset.theme=tg?.colorScheme==='light'?'light':'dark'; }
theme(); tg?.onEvent?.('themeChanged',theme); tg?.ready?.(); tg?.expand?.();
if(demo) $('demo').hidden=false;
function roleLabel(role) { return role&1?'OWNER':role&2?'DRIVER':'CONTACT'; }
function renderControl() {
  const s=snapshot, fresh=isFresh(s), alert=[8,9].includes(s.fsm), expired=performance.now()-started>=120000;
  $('role').textContent=roleLabel(s.role); $('vehicle').textContent=s.vid;
  $('timestamp').textContent=`Snapshot · ${ageText(s.epoch)}`;
  $('hero').className=`card hero ${alert?'alert':''} ${fresh?'':'stale'}`;
  $('stateBadge').textContent=STATES[s.fsm]; $('stateBadge').className=`badge ${alert?'bad':fresh?'good':'warn'}`;
  $('signal').textContent=alert?'!':'◎';
  $('headline').textContent=alert?'Your attention is needed.':s.fsm===1?'On the move.':s.fsm===0?'Starting up.':'Keeping watch.';
  $('summary').textContent=alert?'Check the vehicle and the latest alert in chat.':s.fsm===1?'Photos are unavailable while driving.':s.fsm===7?'The vehicle is in standby. Scheduled patrol follows its current settings.':'Monitoring follows the vehicle’s current state and settings.';
  $('mode').textContent=s.mode?'ON':'AUTO'; $('ack').hidden=!alert; $('ackNote').hidden=!alert;
  $('voltage').textContent=s.valid&2?`${(s.v_mv/1000).toFixed(2)} V`:'Unavailable';
  $('radar').textContent=s.radar===0?'Powered off':s.valid&4?(['Powered off','No presence','Moving','Static','Moving + static'][s.radar]||'Unavailable'):'Unavailable';
  $('distance').textContent=s.valid&4&&s.radar>1?`Distance ${s.distance} cm`:'';
  $('ai').textContent=s.valid&16?`${s.cam_class===0?'Occupied':'Empty'} · ${s.cam_conf}%`:s.cam_status===1?'Check failed':'No result yet';
  $('aiAge').textContent=s.valid&16?`${s.stub?'SIMULATED · ':''}${ageText(s.cam_epoch)} · model score`:'';
  $('gps').textContent=['Unavailable','Recent fix','Last known fix','Demo location'][s.loc_src];
  $('gpsAge').textContent=s.loc_src?ageText(s.loc_epoch):'';
  $('driverStatus').textContent=s.role&2?'You are the current driver.':'Receive driver alerts by assigning yourself.';
  $('drive').hidden=Boolean(s.role&2); $('modes').hidden=!(s.role&3);
  for(const b of document.querySelectorAll('[data-op]')) b.disabled=sent||(!canAct(s,b.dataset.op))||(expired&&b.dataset.op!=='r');
  if(!sent) {
    if(!fresh||expired) notice('This snapshot is old or its time is unavailable. Refresh before taking action.','warn');
    else if(!inTelegram&&!demo) notice('Open controls using the VODAS keyboard button inside Telegram.','warn');
    else if(!demo) notice('');
  }
}
function ask(op,arg) {
  if(!snapshot||sent) return;
  if(!canAct(snapshot,op)) { notice('This action is unavailable. Refresh your snapshot.','warn'); return; }
  const labels={ack:['Acknowledge this alert?','This tells the contacts you received the alert. Monitoring continues; the vehicle is not confirmed safe.'],photo:['Request a new photo?','VODAS will capture a new scene and send the photo and AI result to this conversation.'],drv:['Become the current driver?','Driver alerts for this vehicle will be sent to you first.'],mode:['Change monitoring mode?',arg==='on'?'Start monitoring now using the existing vehicle rules.':'Return to AUTO, which follows the engine and motion signals. This does not switch off protection.']};
  if(!labels[op]) { send(op,arg); return; }
  pendingAction={op,arg}; $('confirmTitle').textContent=labels[op][0]; $('confirmText').textContent=labels[op][1]; $('confirm').showModal();
}
function send(op,arg) {
  if(sent||!snapshot) return;
  if(!canAct(snapshot,op)||(performance.now()-started>=120000&&op!=='r')) { notice('Session expired. Return to chat and send /app.','warn'); return; }
  if(demo) { notice(`Preview: ${op==='r'?'a fresh snapshot':op==='photo'?'a photo':op==='ack'?'an acknowledgement':'this action'} would be requested. No command was sent.`); return; }
  if(!inTelegram||tg.initData||typeof tg.sendData!=='function') { notice('Open controls from the keyboard button after sending /app, not from the bot Menu.','warn'); return; }
  try {
    const random=new Uint32Array(1); crypto.getRandomValues(random);
    const command=makeCommand(snapshot,op,arg,random[0].toString(16).padStart(8,'0'));
    sent=true; renderControl(); notice('Sending request. VODAS will reply in this conversation.'); tg.sendData(command);
  } catch { sent=false; renderControl(); notice('The request could not be sent. Return to chat and try /app again.','error'); }
}
for(const button of document.querySelectorAll('[data-op]')) button.addEventListener('click',()=>ask(button.dataset.op,button.dataset.arg));
$('cancel').onclick=()=>$('confirm').close();
$('proceed').onclick=()=>{ $('confirm').close(); if(pendingAction) send(pendingAction.op,pendingAction.arg); pendingAction=null; };
const eventNames={emergency:'Presence alert',notice:'Notice',safe:'Monitoring round ended',battery_low:'Low battery',ack:'Alert acknowledged',end:'Alert ended',driver_set:'Driver updated'};
function element(tag,cls,text) { const e=document.createElement(tag); e.className=cls; if(text!==undefined) e.textContent=text; return e; }
function renderHistory() {
  const root=$('events'); root.replaceChildren();
  const items=historyItems.filter(e=>!photosOnly||Boolean(e.photo_url));
  if(!items.length) root.append(element('div','empty',historyItems.length?'No photos in the loaded activity. Load earlier activity to look further.':'No saved activity is available yet.'));
  for(const e of items) {
    const article=element('article','event'), row=element('div','row'), icon=element('span','timeline-icon',e.type==='emergency'?'!':'◉'), body=element('div','event-main');
    const label=e.reason==='manual_photo'?'Requested photo':eventNames[e.type]||'Saved event';
    body.append(element('span',`badge ${e.type==='emergency'?'bad':''}`,label),element('h3','',e.ts?new Date(e.ts*1000).toLocaleString():'Capture time unavailable'));
    if([0,1].includes(e.ai_class)&&Number.isInteger(e.ai_conf)&&e.ai_conf>=0&&e.ai_conf<=100)
      body.append(element('p','',`AI: ${e.ai_class===0?'occupied':'empty'} · ${e.ai_conf}% model score`));
    if(e.photo_url) {
      try { const url=new URL(e.photo_url); if(url.protocol==='https:') { const img=element('img','event-photo'); img.src=url.href; img.alt='Saved cabin photo'; img.loading='lazy'; img.referrerPolicy='no-referrer'; img.onerror=()=>{ img.replaceWith(element('p','meta','Photo unavailable or link expired. Reload history to request a fresh link.')); }; body.append(img); } } catch { /* Reject invalid image addresses. */ }
    }
    const map=mapLink(e.loc);
    if(map) { const link=element('a','button small secondary',e.loc.src===3?'Open demo location':e.loc.src===2?'Open last known location':'Open location'); link.href=map; link.target='_blank'; link.rel='noopener noreferrer'; body.append(link); }
    row.append(icon,body); article.append(row); root.append(article);
  }
  $('more').hidden=!cursor; $('more').disabled=loading;
}
async function loadHistory(reset=false) {
  if(loading) return;
  loading=true; $('loading').hidden=false; $('retry').hidden=true; $('more').disabled=true;
  try {
    if(demo) {
      historyItems=[{event_id:3,type:'emergency',ts:Date.now()/1000-60,ai_class:0,ai_conf:90,loc:{src:2,lat:10.7769,lon:106.7009}}, {event_id:2,type:'notice',reason:'manual_photo',ts:Date.now()/1000-300,ai_class:1,ai_conf:94}, {event_id:1,type:'ack',ts:Date.now()/1000-600}]; cursor=null;
    } else {
      const cfg=window.VODAS_CONFIG;
      if(!inTelegram||!tg.initData) throw Error('Open History using the bot Menu or its History button in Telegram.');
      if(!cfg?.historyApi||!cfg?.deviceId) throw Error('History is not configured yet. Your Telegram controls still work.');
      const url=new URL(cfg.historyApi);
      if(url.protocol!=='https:'||url.username||url.password||url.search||url.hash) throw Error('History configuration is invalid.');
      url.searchParams.set('device_id',cfg.deviceId); url.searchParams.set('limit','20'); if(cursor&&!reset) url.searchParams.set('cursor',cursor);
      const response=await fetch(url,{headers:{'x-tg-init-data':tg.initData},cache:'no-store',credentials:'omit',signal:AbortSignal.timeout(15000)});
      if(response.status===401) throw Error('Your Telegram session expired. Close and reopen History.');
      if(response.status===403) throw Error('History access is unavailable for this account or vehicle.');
      if(response.status===503) throw Error('History is temporarily unavailable. The vehicle may need to sync its permissions. Try again later.');
      if(response.status===429) throw Error('Too many requests. Wait a moment and try again.');
      if(!response.ok) throw Error('History could not be loaded. Please try again.');
      const data=await response.json();
      if(!Array.isArray(data.items)||data.items.length>50||data.device_id!==cfg.deviceId||
         (data.next_cursor!==null&&typeof data.next_cursor!=='string')||(data.next_cursor?.length||0)>2048) throw Error('History returned an invalid response.');
      const combined=reset?data.items:[...historyItems,...data.items],seen=new Set();
      historyItems=combined.filter(e=>{ const id=`${e.event_id}:${e.ts}`; if(seen.has(id)) return false; seen.add(id); return true; }).slice(-200);
      cursor=data.next_cursor; $('vehicle').textContent=data.vid||cfg.deviceId; notice('');
    }
    renderHistory();
  } catch(error) { notice(error.name==='TimeoutError'?'History timed out. Try again.':error.message,'error'); $('retry').hidden=false; }
  finally { loading=false; $('loading').hidden=true; $('more').disabled=false; }
}
$('more').onclick=()=>loadHistory(); $('retry').onclick=()=>loadHistory(true);
$('filterAll').onclick=()=>{photosOnly=false; $('filterAll').setAttribute('aria-selected','true'); $('filterPhotos').setAttribute('aria-selected','false'); renderHistory();};
$('filterPhotos').onclick=()=>{photosOnly=true; $('filterAll').setAttribute('aria-selected','false'); $('filterPhotos').setAttribute('aria-selected','true'); renderHistory();};
if(historyPage) {
  $('history').hidden=false; $('role').textContent='HISTORY'; $('eyebrow').textContent='Saved activity'; $('vehicle').textContent='Every event, in context.'; $('timestamp').textContent='Latest uploads first · Read-only'; loadHistory(true);
} else {
  try {
    const encoded=params.get('s');
    snapshot=demo?demoSnapshot(scenario):parseSnapshot(encoded);
    history.replaceState(null,'',location.pathname+(demo?`?demo=${scenario}`:''));
    $('control').hidden=false; renderControl(); setInterval(renderControl,1000);
    if(scenario==='error') notice('The vehicle did not respond. Nothing is marked as completed. Return to chat and try /app.','error');
  } catch(error) { notice(error.message,'error'); }
}
