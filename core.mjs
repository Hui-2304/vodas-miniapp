export const STATES = ['Starting', 'Driving', 'Confirming park', 'Parked', 'Scanning', 'Camera check', 'Resting', 'Standby', 'Active alert', 'Alert acknowledged'];
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
  return Object.freeze(s);
}
export function isFresh(s, now = Date.now()/1000) { return Boolean(s.valid&1) && s.epoch<=now+30 && now-s.epoch<120; }
export function canAct(s, op, now = Date.now()/1000) {
  if (op==='r') return true;
  if (op==='loc') return !(s.valid&1) || isFresh(s,now);
  if (!isFresh(s,now) || /^00000000/.test(s.sid)) return false;
  if (op==='ack') return s.alert_id>0 && [8,9].includes(s.fsm);
  if (op==='photo') return s.fsm>=3 && s.fsm!==5;
  if (op==='drv') return !(s.role&2);
  if (op==='mode') return Boolean(s.role&3);
  return false;
}
export function makeCommand(s, op, arg, rid) {
  if (!/^[0-9a-f]{8}$/i.test(rid)) throw Error('Invalid request ID.');
  let suffix='';
  if (op==='ack') { if (!integer(s.alert_id,1,65535)) throw Error('No active alert.'); suffix=` ${s.alert_id}`; }
  else if (op==='mode') { if (!['on','auto'].includes(arg)) throw Error('Invalid mode.'); suffix=` ${arg}`; }
  else if (!['r','loc','photo','drv'].includes(op) || arg) throw Error('Invalid action.');
  const command=`v1 ${rid} ${s.sid} ${s.cfg_seq} ${op}${suffix}`;
  if (new TextEncoder().encode(command).length>160) throw Error('Request too long.');
  return command;
}
export function mapLink(loc) {
  if (!loc || ![1,2,3].includes(loc.src) || !Number.isFinite(loc.lat) || !Number.isFinite(loc.lon) || Math.abs(loc.lat)>90 || Math.abs(loc.lon)>180) return null;
  return `https://maps.google.com/?q=${loc.lat.toFixed(7)},${loc.lon.toFixed(7)}`;
}
export function ageText(epoch, now=Date.now()/1000) {
  if (!epoch) return 'Time unavailable';
  if (epoch>now+30) return 'Time needs verification';
  const age=Math.max(0,Math.floor(now-epoch));
  const value=age<60?age:age<3600?Math.floor(age/60):Math.floor(age/3600);
  const unit=age<60?'second':age<3600?'minute':'hour';
  return `${value} ${unit}${value===1?'':'s'} ago`;
}
export function demoSnapshot(scenario='normal', now=Math.floor(Date.now()/1000)) {
  return {ver:1,role:1,sid:'000004d200000001',cfg_seq:512,epoch:now-18,valid:31,fsm:scenario==='alert'?8:scenario==='busy'?5:6,
    mode:0,phase:1,cycle:2,alert_id:scenario==='alert'?37:0,v_mv:12480,radar:scenario==='alert'?3:1,distance:67,
    loc_src:2,lat_e7:107769000,lon_e7:1067009000,loc_epoch:now-300,gsm:3,cam_status:0,cam_class:scenario==='alert'?0:1,
    cam_conf:scenario==='alert'?90:94,cam_epoch:now-90,vid:'SHUTTLE-01',device_id:'VODAS-DEMO',stub:false,
    ...(scenario==='stale'?{epoch:now-300}:{}),...(scenario==='unknown'?{valid:0,epoch:0,cam_status:255,cam_class:255,cam_conf:255,loc_src:0}:{}),};
}
