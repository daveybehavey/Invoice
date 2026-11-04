import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {test} from 'node:test';
const source=readFileSync('public/features/intake/aiIntake.jsx','utf8');
const reader=source.slice(source.indexOf('function readIntakeSession'),source.indexOf('function AIIntake()'));
function read(key: string, values: Record<string,string>) {
  return vm.runInNewContext(`${reader}\nreadIntakeSession(${JSON.stringify(key)});`, {window:{sessionStorage:{getItem:(k:string)=>values[k]}}});
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
