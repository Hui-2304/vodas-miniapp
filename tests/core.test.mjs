import test from 'node:test';
import assert from 'node:assert/strict';
import {parseSnapshot,demoSnapshot,canAct,makeCommand,contactValue,validateSetting} from '../core.mjs';
const encode=s=>Buffer.from(JSON.stringify(s)).toString('base64url');
test('vehicle extension validates thresholds and supports old snapshots',()=>{
  const s=demoSnapshot();assert.equal(parseSnapshot(encode(s)).x[0],12);
  const {x,...legacy}=s;assert.equal(parseSnapshot(encode(legacy)).x,undefined);
  for(const bad of [[12,12000,13000,12500,0,0,1,0,100,1,1],[...x.slice(0,10),2]])
    assert.throws(()=>parseSnapshot(encode({...s,x:bad})));
});
test('owner controls require a new supported snapshot; driver keeps mode only',()=>{
  const s=demoSnapshot();
  for(const op of ['cfg','contact','del','driver']) {
    assert.equal(canAct(s,op),true);assert.equal(canAct({...s,role:2},op),false);
    assert.equal(canAct({...s,epoch:1},op),false);assert.equal(canAct({...s,x:undefined},op),false);
  }
  assert.equal(canAct({...s,role:2},'mode'),true);
  assert.equal(canAct(s,'radar'),false);assert.equal(canAct({...s,fsm:7},'radar'),true);
});
test('vehicle commands have bounded, explicit operations and atomic thresholds',()=>{
  const s=demoSnapshot();
  assert.match(makeCommand(s,'cfg','vth=13400,12900,12000','abcdef01'),/ cfg vth=13400,12900,12000$/);
  for(const value of ['pin=1234','gsm_off=0','vth=12000,12900,13400','vth=13400,13350,12000','vcal=40000','vid=<script>'])
    assert.throws(()=>validateSetting(value));
  for(const op of ['buzz','radar','contacts'])assert.match(makeCommand(s,op,undefined,'abcdef01'),new RegExp(` ${op}$`));
  assert.throws(()=>makeCommand(s,'del','1','abcdef01'));
  assert.throws(()=>makeCommand(s,'led','off','abcdef01'));
});
test('UTF-8 contacts are encoded as command data and never added to snapshot URLs',()=>{
  const s=demoSnapshot(),value=contactValue('2','Hà','0912345678','');
  assert.equal(value,'2,0,0912345678,SMOg');
  const cmd=makeCommand(s,'contact',value,'abcdef01');assert.ok(Buffer.byteLength(cmd)<=160);
  assert.throws(()=>contactValue('6','Huy','0912345678'));
  assert.throws(()=>contactValue('2','a'.repeat(17),'0912345678'));
  assert.throws(()=>contactValue('2','Huy','0912345678','4503599627370496'));
  assert.throws(()=>contactValue('2','Huy\n','0912345678'));
  assert.ok(!JSON.stringify(s).includes('0912345678'));
});
