import {initVehicleControls,renderVehicle} from './vehicle.mjs?v=20261022-vehicle1';
import {STATES,parseSnapshot,isFresh,canAct,makeCommand,mapLink,ageText,demoSnapshot} from './core.mjs?v=20261022-vehicle1';
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
function roleLabel(role) { return role&1?'CHỦ XE':role&2?'TÀI XẾ':'LIÊN HỆ'; }
function renderControl() {
  const s=snapshot, fresh=isFresh(s), alert=[8,9].includes(s.fsm), expired=performance.now()-started>=120000;
  $('role').textContent=roleLabel(s.role); $('vehicle').textContent=s.vid;
  $('timestamp').textContent=`Cập nhật · ${ageText(s.epoch)}`;
  $('hero').className=`card hero ${alert?'alert':''} ${fresh?'':'stale'}`;
  $('stateBadge').textContent=STATES[s.fsm]; $('stateBadge').className=`badge ${alert?'bad':fresh?'good':'warn'}`;
  $('signal').textContent=alert?'!':'◎';
  $('headline').textContent=alert?'Có cảnh báo trên xe.':s.fsm===1?'Xe đang di chuyển.':s.fsm===0?'Đang khởi động.':'Đang theo dõi xe.';
  $('summary').textContent=alert?'Kiểm tra xe và xem cảnh báo mới nhất trong cuộc trò chuyện.':s.fsm===1?'Chức năng chụp ảnh tạm khóa khi xe đang chạy.':s.fsm===7?'Xe đang ở chế độ chờ. Lượt kiểm tra định kỳ chạy theo cấu hình hiện tại.':'Thiết bị giám sát theo trạng thái và cấu hình của xe.';
  $('mode').textContent=s.mode?'ON':'AUTO'; $('ack').hidden=!alert; $('ackNote').hidden=!alert;
  $('voltage').textContent=s.valid&2?`${(s.v_mv/1000).toFixed(2)} V`:'Chưa có dữ liệu';
  $('radar').textContent=s.radar===0?'Đang tắt':s.valid&4?(['Đang tắt','Không phát hiện','Chuyển động','Đứng yên','Cả hai trạng thái'][s.radar]||'Chưa có dữ liệu'):'Chưa có dữ liệu';
  $('distance').textContent=s.valid&4&&s.radar>1?`Khoảng cách ${s.distance} cm`:'';
  $('ai').textContent=s.valid&16?`${s.cam_class===0?'Có người':'Không có người'} · ${s.cam_conf}%`:s.cam_status===1?'Phân tích thất bại':'Chưa có kết quả';
  $('aiAge').textContent=s.valid&16?`${s.stub?'SIMULATED · ':''}${ageText(s.cam_epoch)} · model score`:'';
  $('gps').textContent=['Chưa có dữ liệu','Vị trí gần đây','Vị trí đã lưu','Vị trí mô phỏng'][s.loc_src];
  $('gpsAge').textContent=s.loc_src?ageText(s.loc_epoch):'';
  $('driverStatus').textContent=s.role&2?'Bạn là tài xế hiện tại.':'Nhận cảnh báo ưu tiên bằng cách đăng ký làm tài xế.';
  $('drive').hidden=Boolean(s.role&2); $('modes').hidden=!(s.role&3);
  for(const b of document.querySelectorAll('[data-op]')) b.disabled=sent||(!canAct(s,b.dataset.op))||(expired&&b.dataset.op!=='r');
  renderVehicle(s,sent,expired);
  if(!sent) {
    if(!fresh||expired) notice('Dữ liệu đã cũ hoặc chưa có giờ đáng tin cậy. Lấy trạng thái mới trước khi thao tác.','warn');
    else if(!inTelegram&&!demo) notice('Mở bằng nút VODAS trong bàn phím chat Telegram.','warn');
    else if(!demo) notice('');
  }
}
function ask(op,arg) {
  if(!snapshot||sent) return;
  if(op==='cfg'&&arg?.startsWith('vcal=')&&snapshot.fsm!==7){notice('Chỉ hiệu chỉnh điện áp khi xe ở trạng thái chờ.','warn');return;}
  if(!canAct(snapshot,op)) { notice('Chức năng chưa khả dụng. Gửi /app để lấy trạng thái mới.','warn'); return; }
  const labels={ack:['Xác nhận đã nhận cảnh báo?','Các liên hệ sẽ biết bạn đã nhận cảnh báo. Thiết bị tiếp tục giám sát; xe chưa được xác nhận an toàn.'],photo:['Yêu cầu chụp ảnh mới?','VODAS chụp ảnh mới và gửi kèm kết quả AI vào cuộc trò chuyện này.'],drv:['Đăng ký làm tài xế?','Bạn sẽ được ưu tiên nhận cảnh báo dành cho tài xế của xe này.'],mode:['Thay đổi chế độ giám sát?',arg==='on'?'Bắt đầu giám sát ngay theo quy trình đã cài đặt.':'Chuyển sang AUTO, theo tín hiệu động cơ và chuyển động. Xe vẫn được bảo vệ theo cấu hình.']};
  Object.assign(labels,{
    cfg:['Lưu cấu hình thiết bị?','Thiết bị kiểm tra giá trị và trả kết quả trong chat.'],
    contact:['Lưu liên hệ cảnh báo?','Tên, số điện thoại và Telegram ID bạn nhập sẽ thay thế thông tin tại vị trí đã chọn. Các giá trị đang để trống được xử lý theo hướng dẫn của biểu mẫu.'],
    del:['Xóa liên hệ này?',`Liên hệ số ${arg} sẽ ngừng nhận cảnh báo và mất quyền điều khiển xe.`],
    driver:['Chỉ định tài xế?',`Chọn liên hệ số ${arg} đã có trong danh bạ làm tài xế hiện tại.`],
    led:['Bắt đầu kiểm tra LED?','Vòng LED trên xe sẽ chạy phép thử ngắn rồi tự trở về hiệu ứng thông thường.'],
    buzz:['Bắt đầu thử còi?','Còi trên xe sẽ phát âm thanh trong khoảng 3 giây.'],
    radar:['Quét thử radar?','Radar sẽ quét trong 10 giây. Sau đó gửi /app để lấy trạng thái mới. Chỉ thực hiện khi xe đang chờ và không trong một lượt giám sát.']
  });
  if(op==='cfg') {
    const [key,value]=arg.split('=');
    const volts=n=>`${(Number(n)/1000).toFixed(2)} V`;
    if(key==='vth') { const [on,off,low]=value.split(','); labels.cfg[1]=`Bật máy: ${volts(on)}\nTắt máy: ${volts(off)}\nẮc quy yếu: ${volts(low)}\nLưu cả ba ngưỡng trên xe.`; }
    if(key==='vprofile') labels.cfg[1]=`Chọn xe ${value} V và thay cả ba ngưỡng điện bằng bộ mặc định tương ứng.`;
    if(key==='vid') labels.cfg[1]=`Đổi mã xe hiển thị thành ${value}.`;
    if(key==='vcal') labels.cfg[1]=`Dùng số đo thực tế ${volts(value)} để hiệu chỉnh điện áp của thiết bị.`;
    if(key==='buzzer') labels.cfg[1]=value==='off'?'Tắt âm thanh của còi trên xe.':'Bật lại âm thanh của còi cảnh báo trên xe.';
  }
  if(op==='contact') {
    const [slot,chat,phone,name]=arg.split(',');
    const decoded=new TextDecoder().decode(Uint8Array.from(atob(name.replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0)));
    labels.contact[1]=`Liên hệ số ${slot}: ${decoded}\nSố điện thoại: ${phone==='-'?'xóa số hiện có':phone}\nTelegram ID: ${chat==='0'?'giữ ID hiện có (nếu đã lưu)':chat}`;
  }
  if(!labels[op]) { send(op,arg); return; }
  pendingAction={op,arg}; $('confirmTitle').textContent=labels[op][0]; $('confirmText').textContent=labels[op][1]; $('confirm').showModal();
}
function send(op,arg) {
  if(sent||!snapshot) return;
  if(!canAct(snapshot,op)||(performance.now()-started>=120000&&op!=='r')) { notice('Phiên đã hết hạn. Trở về chat và gửi /app.','warn'); return; }
  if(demo) { notice(`Preview: ${op==='r'?'a fresh snapshot':op==='photo'?'a photo':op==='ack'?'an acknowledgement':'this action'} would be requested. No command was sent.`); return; }
  if(!inTelegram||tg.initData||typeof tg.sendData!=='function') { notice('Gửi /app rồi mở bằng nút điều khiển trong bàn phím chat Telegram.','warn'); return; }
  try {
    const random=new Uint32Array(1); crypto.getRandomValues(random);
    const command=makeCommand(snapshot,op,arg,random[0].toString(16).padStart(8,'0'));
    sent=true; renderControl(); notice('Đang gửi yêu cầu. VODAS sẽ trả kết quả trong cuộc trò chuyện.'); tg.sendData(command);
  } catch { sent=false; renderControl(); notice('Chưa gửi được yêu cầu. Trở về chat và gửi /app để thử lại.','error'); }
}
initVehicleControls(ask,notice);
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
