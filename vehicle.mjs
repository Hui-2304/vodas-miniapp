import {canAct,validateSetting,contactValue} from './core.mjs?v=20261022-vehicle1';
const $=id=>document.getElementById(id);
let initialized=false;
export function initVehicleControls(ask,notice) {
  for(const tab of document.querySelectorAll('[data-view]')) tab.onclick=()=>{
    for(const item of document.querySelectorAll('[data-view]')) {
      if(item===tab)item.setAttribute('aria-current','page');else item.removeAttribute('aria-current');
    }
    for(const panel of document.querySelectorAll('[data-panel]'))panel.hidden=panel.dataset.panel!==tab.dataset.view;
  };
  const mv=id=>Math.round(Number($(id).value)*1000);
  const forms={
    profileForm:()=>['cfg',`vprofile=${$('profileInput').value}`],
    thresholdForm:()=>['cfg',`vth=${mv('onInput')},${mv('offInput')},${mv('lowInput')}`],
    calibrationForm:()=>['cfg',`vcal=${mv('calibrationInput')}`],
    vehicleForm:()=>['cfg',`vid=${$('vehicleInput').value.trim()}`],
    soundForm:()=>['cfg',`buzzer=${$('soundInput').value}`],
    contactForm:()=>['contact',contactValue($('contactSlot').value,$('contactName').value,$('contactPhone').value,$('contactChat').value)],
    driverForm:()=>['driver',$('driverInput').value],
    deleteForm:()=>['del',$('deleteInput').value]
  };
  for(const [id,build] of Object.entries(forms)) $(id).onsubmit=event=>{
    event.preventDefault();
    try {const [op,value]=build();if(op==='cfg')validateSetting(value);ask(op,value);}
    catch(error){notice(error.message,'error');}
  };
}
export function renderVehicle(s,sent,expired) {
  const x=s.x,available=Boolean(x),owner=Boolean(s.role&1);
  $('upgradeNotice').hidden=available;
  $('ownerNotice').hidden=owner;
  for(const card of document.querySelectorAll('.owner-editor'))card.hidden=!owner;
  $('powerProfile').textContent=x?`Hệ thống ${x[0]} V`:'';
  $('lightReading').textContent=x&&x[6]?`${(x[7]/10).toFixed(1)} lux`:'Chưa có dữ liệu';
  $('cellReading').textContent=['Chưa sẵn sàng','Chưa có SIM','Đang tìm mạng','Đã đăng ký mạng'][s.gsm]||'Chưa xác định';
  $('soundReading').textContent=x?(x[5]?'Đã tắt âm thanh':'Đang bật'):'Chưa có dữ liệu';
  $('assignedDriver').textContent=x&&x[9]?`Tài xế hiện tại: liên hệ số ${x[9]}.`:'Chưa xác định tài xế.';
  $('thresholdSummary').textContent=x?`Bật ${(x[1]/1000).toFixed(2)} V · Tắt ${(x[2]/1000).toFixed(2)} V · Yếu ${(x[3]/1000).toFixed(2)} V`:'Lấy bản trạng thái mới để xem cấu hình.';
  $('offsetReading').textContent=x?`Bù điện áp hiện tại: ${x[4]} mV.`:'';
  for(const button of document.querySelectorAll('[data-form-op]')) {
    button.disabled=sent||expired||!canAct(s,button.dataset.formOp);
    for(const field of button.form.querySelectorAll('input,select'))field.disabled=button.disabled;
  }
  if(!initialized&&x) {
    $('profileInput').value=String(x[0]);$('onInput').value=(x[1]/1000).toFixed(2);
    $('offInput').value=(x[2]/1000).toFixed(2);$('lowInput').value=(x[3]/1000).toFixed(2);
    $('vehicleInput').value=s.vid;$('soundInput').value=x[5]?'off':'on';
    $('driverInput').value=String(x[9]||1);initialized=true;
  }
}
