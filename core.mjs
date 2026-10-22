export const STATES = ['Đang khởi động', 'Đang di chuyển', 'Xác nhận đỗ xe', 'Đã đỗ xe', 'Đang quét', 'Phân tích ảnh', 'Đang nghỉ', 'Đang chờ', 'Có cảnh báo', 'Đã nhận cảnh báo'];
const integer = (x, min, max) => Number.isInteger(x) && x >= min && x <= max;
export function parseSnapshot(encoded) {
  if (typeof encoded !== 'string' || encoded.length > 900 || !/^[A-Za-z0-9_-]+$/.test(encoded)) throw Error('Invalid snapshot. Return to chat and send /app.');
  let s;
  try { s = JSON.parse(new TextDecoder('utf-8', {fatal:true}).decode(Uint8Array.from(atob(encoded.replace(/-/g,'+').replace(/_/g,'/')), c => c.charCodeAt(0)))); }
  catch { throw Error('This snapshot could not be read. Send /app again.'); }
  if (!s || s.ver !== 1 || !/^[0-9a-fA-F]{16}$/.test(s.sid) || !integer(s.role,0,3)) throw Error('Unsupported snapshot. Send /app again.');
  for (const field of ['cfg_seq','epoch','loc_epoch','cam_epoch']) if (!integer(s[field],0,4294967295)) throw Error('Invalid snapshot time or revision.');
  for (const [field,max] of [['valid',31],['fsm',9],['mode',1],['phase',2],['cycle',255],['alert_id',65535],['v_mv',65535],['distance',65535],['loc_src',3],['gsm',255]])
    if (!integer(s[field],0,max)) throw Error('Invalid snapshot values.');
  if (![0,1,2,3,4,255].includes(s.radar) || ![0,1,255].includes(s.cam_status) || ![0,1,255].includes(s.cam_class) ||
      !integer(s.cam_conf,0,255) || (s.cam_conf>100 && s.cam_conf!==255) || !integer(s.lat_e7,-900000000,900000000) ||
      !integer(s.lon_e7,-1800000000,1800000000) || typeof s.stub !== 'boolean' ||
      !/^[\w.-]{1,16}$/.test(s.vid) || !/^[\w.-]{1,16}$/.test(s.device_id)) throw Error('Invalid vehicle snapshot.');
  if ((s.valid&16) && (s.cam_status!==0 || s.cam_class>1 || s.cam_conf>100)) throw Error('Invalid AI result.');
  if(s.x!==undefined && (!Array.isArray(s.x)||s.x.length!==11||
    ![12,24].includes(s.x[0])||!s.x.slice(1,4).every(v=>integer(v,6000,36000))||
    !(s.x[3]<s.x[2]&&s.x[2]+100<=s.x[1])||!integer(s.x[4],-32768,32767)||
    !integer(s.x[5],0,1)||!integer(s.x[6],0,1)||!integer(s.x[7],0,4294967295)||
    !integer(s.x[8],0,65535)||!integer(s.x[9],0,5)||s.x[10]!==1)) throw Error('Cấu hình xe không hợp lệ. Gửi /app để mở lại.');
  if(s.x) Object.freeze(s.x);
  return Object.freeze(s);
}
export function isFresh(s, now = Date.now()/1000) { return Boolean(s.valid&1) && s.epoch<=now+30 && now-s.epoch<120; }
export function canAct(s, op, now = Date.now()/1000) {
  if (op==='r') return true;
  if (op==='contacts') return Boolean(s.x);
  if (op==='loc') return !(s.valid&1) || isFresh(s,now);
  if (!isFresh(s,now) || /^00000000/.test(s.sid)) return false;
  if (op==='ack') return s.alert_id>0 && [8,9].includes(s.fsm);
  if (op==='photo') return s.fsm>=3 && s.fsm!==5;
  if (op==='drv') return !(s.role&2);
  if (op==='mode') return Boolean(s.role&3);
  if(['cfg','contact','del','driver'].includes(op)) return Boolean(s.x&&(s.role&1));
  if(['led','buzz','radar'].includes(op)) return Boolean(s.x&&(s.role&1)&&s.fsm===7&&(op!=='buzz'||!s.x[5]));
  return false;
}
export function makeCommand(s, op, arg, rid) {
  if (!/^[0-9a-f]{8}$/i.test(rid)) throw Error('Invalid request ID.');
  let suffix='';
  if (op==='ack') { if (!integer(s.alert_id,1,65535)) throw Error('No active alert.'); suffix=` ${s.alert_id}`; }
  else if (op==='mode') { if (!['on','auto'].includes(arg)) throw Error('Invalid mode.'); suffix=` ${arg}`; }
  else if(op==='cfg') { validateSetting(arg); suffix=` ${arg}`; }
  else if(op==='contact') { validateContact(arg); suffix=` ${arg}`; }
  else if(['del','driver'].includes(op)) {
    if(!/^[1-5]$/.test(String(arg))||(op==='del'&&String(arg)==='1')) throw Error('Chọn liên hệ hợp lệ; không thể xóa chủ xe.');
    suffix=` ${arg}`;
  } else if(op==='led') {
    if(!['test','walk','auto'].includes(arg)) throw Error('Chế độ LED không hợp lệ.'); suffix=` ${arg}`;
  } else if (!['r','loc','photo','drv','contacts','buzz','radar'].includes(op) || arg) throw Error('Invalid action.');
  const command=`v1 ${rid} ${s.sid} ${s.cfg_seq} ${op}${suffix}`;
  if (new TextEncoder().encode(command).length>160) throw Error('Request too long.');
  return command;
}
export function validateSetting(value) {
  if(typeof value!=='string'||value.length>80) throw Error('Cấu hình quá dài.');
  if(/^vprofile=(12|24)$/.test(value)||/^buzzer=(on|off)$/.test(value)||/^vid=[A-Za-z0-9-]{1,12}$/.test(value)) return value;
  if(/^vcal=\d{4,5}$/.test(value)) {const n=Number(value.split('=')[1]);if(n>=6000&&n<=36000)return value;}
  if(/^vth=\d{4,5},\d{4,5},\d{4,5}$/.test(value)) {
    const [on,off,low]=value.slice(4).split(',').map(Number);
    if(low>=6000&&on<=36000&&low<off&&off+100<=on)return value;
  }
  throw Error('Kiểm tra ngưỡng: điện áp thấp < tắt máy < bật máy, chênh ít nhất 0,10 V; từ 6–36 V.');
}
export function contactValue(slot,name,phone,chat='0') {
  const bytes=new TextEncoder().encode(name.trim());
  if(bytes.length<1||bytes.length>16||/[\x00-\x1f\x7f]/.test(name)) throw Error('Tên cần từ 1–16 byte UTF-8; hãy dùng tên ngắn.');
  const encoded=btoa(String.fromCharCode(...bytes)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
  const value=`${slot},${chat.trim()||'0'},${phone.trim()||'-'},${encoded}`;
  validateContact(value); return value;
}
export function validateContact(value) {
  if(typeof value!=='string'||value.length>80||!/^([1-5]),\d{1,16},(-|\+?\d{9,15}),[A-Za-z0-9_-]{2,22}$/.test(value)) throw Error('Kiểm tra số thứ tự, số điện thoại và Telegram ID.');
  const [,chat,phone,name]=value.split(',');
  if(!Number.isSafeInteger(Number(chat))||Number(chat)>=2**52||phone.length>15) throw Error('Telegram ID hoặc số điện thoại không hợp lệ.');
  try {const decoded=new TextDecoder('utf-8',{fatal:true}).decode(Uint8Array.from(atob(name.replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0)));
    if(!decoded||new TextEncoder().encode(decoded).length>16||/[\x00-\x1f\x7f]/.test(decoded)) throw Error();
  } catch {throw Error('Tên liên hệ không hợp lệ.');}
  return value;
}
export function mapLink(loc) {
  if (!loc || ![1,2,3].includes(loc.src) || !Number.isFinite(loc.lat) || !Number.isFinite(loc.lon) || Math.abs(loc.lat)>90 || Math.abs(loc.lon)>180) return null;
  return `https://maps.google.com/?q=${loc.lat.toFixed(7)},${loc.lon.toFixed(7)}`;
}
export function ageText(epoch, now=Date.now()/1000) {
  if (!epoch) return 'Chưa có thời gian';
  if (epoch>now+30) return 'Cần kiểm tra đồng hồ';
  const age=Math.max(0,Math.floor(now-epoch));
  const value=age<60?age:age<3600?Math.floor(age/60):Math.floor(age/3600);
  const unit=age<60?'giây':age<3600?'phút':'giờ';
  return `${value} ${unit} trước`;
}
export function demoSnapshot(scenario='normal', now=Math.floor(Date.now()/1000)) {
  return {ver:1,role:1,sid:'000004d200000001',cfg_seq:512,epoch:now-18,valid:31,fsm:scenario==='alert'?8:scenario==='busy'?5:6,
    mode:0,phase:1,cycle:2,alert_id:scenario==='alert'?37:0,v_mv:12480,radar:scenario==='alert'?3:1,distance:67,
    loc_src:2,lat_e7:107769000,lon_e7:1067009000,loc_epoch:now-300,gsm:3,cam_status:0,cam_class:scenario==='alert'?0:1,
    cam_conf:scenario==='alert'?90:94,cam_epoch:now-90,vid:'SHUTTLE-01',device_id:'VODAS-DEMO',stub:false,
    x:[12,13400,12900,12000,0,0,1,117,100,1,1],
    ...(scenario==='stale'?{epoch:now-300}:{}),...(scenario==='unknown'?{valid:0,epoch:0,cam_status:255,cam_class:255,cam_conf:255,loc_src:0}:{}),};
}
