import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {test} from 'node:test';
const source=readFileSync('public/features/intake/aiIntake.jsx','utf8');
const reader=source.slice(source.indexOf('function readIntakeSession'),source.indexOf('function AIIntake()'));
function read(key: string, values: Record<string,string>) {
  return vm.runInNewContext(`${reader}\nreadIntakeSession(${JSON.stringify(key)});`, {window:{sessionStorage:{getItem:(k:string)=>values[k]}}});
}
function resolve(saved: unknown, seedText: string) {
  return vm.runInNewContext(`${reader}\nresolveRestoredIntake(${JSON.stringify(saved)}, ${JSON.stringify(seedText)});`, {window:{sessionStorage:{getItem:()=>null}}});
}
const snapshot={version:1,messages:[],inputValue:'unique notes',transcript:'unique notes',intakePhase:'ready_to_summarize',openDecisions:[],assumptions:[],unparsedLines:[]};
test('intake recovery isolates identities and accepts a review snapshot',()=>{
  const values={'session::owner:a':JSON.stringify(snapshot)};
  assert.equal(read('session::owner:a',values).inputValue,'unique notes');
  assert.equal(read('session::owner:b',values),null);
});
test('intake recovery safely rejects corrupt and incompatible snapshots',()=>{
  for(const value of ['{', 'null', JSON.stringify({...snapshot,version:2}),JSON.stringify({...snapshot,messages:[null]}),JSON.stringify({...snapshot,openDecisions:{}}),JSON.stringify({...snapshot,transcript:4})]) assert.equal(read('key',{key:value}),null);
});
test('interrupted recovery keeps the in-flight submission as input only, not as a message',()=>{
  const saved={...snapshot,interrupted:true,inputValue:'Roof repair, 3 hours',transcript:'Roof repair, 3 hours',messages:[{role:'assistant',text:'Hi'},{role:'user',text:'Roof repair, 3 hours'}]};
  const resolved=resolve(saved,'');
  assert.equal(resolved.inputValue,'Roof repair, 3 hours');
  assert.equal(resolved.messages.length,1);
  assert.equal(resolved.messages[0].role,'assistant');
  assert.equal(resolved.messages[0].text,'Hi');
  const untouched=resolve({...saved,inputValue:'different typed text'},'');
  assert.equal(untouched.messages.length,2);
});
test('a fresh scratchpad seed wins over recovery; a reflected seed does not displace it',()=>{
  const saved={...snapshot,inputValue:'Old job notes',transcript:'Old job notes',messages:[{role:'user',text:'Old job notes'}]};
  assert.equal(resolve(saved,'Brand new scratchpad note'),null);
  const reflected={...snapshot,inputValue:'Brand new scratchpad note',transcript:'Brand new scratchpad note',messages:[{role:'user',text:'Brand new scratchpad note'}]};
  assert.equal(resolve(reflected,'Brand new scratchpad note').inputValue,'Brand new scratchpad note');
});
