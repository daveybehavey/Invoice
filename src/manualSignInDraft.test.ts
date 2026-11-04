import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {test} from 'node:test';
const code=readFileSync('public/features/manual/manualDraftStorage.js','utf8');
function harness() {
  const local = new Map<string,string>(); const session = new Map<string,string>();
  const storage = (values: Map<string,string>) => ({getItem:(k:string)=>values.get(k)??null,setItem:(k:string,v:string)=>values.set(k,v),removeItem:(k:string)=>values.delete(k)});
  const window:any = {localStorage:storage(local),sessionStorage:storage(session),crypto:{randomUUID:()=> 'unique-nonce'},location:{search:''},InvoiceRequestIdentity:{getAuthSession:()=>null}};
  vm.runInNewContext(code,{window,URLSearchParams,Date});
  return {api:window.InvoiceManualDraftStorage,window,local,session};
}
test('sign-in draft handoff is explicit, one-time and strips saved-record authority',()=>{
  const h=harness();
  const draft={lineItems:[{description:'Roof',qty:'1',rate:'325'}],savedInvoiceId:'old-owner-record',savedInvoiceStatus:'paid',paymentLinkUrl:'old-link',portalAccessToken:'old-token',paymentRecords:[{}]};
  const nonce=h.api.rememberSignInDraft(draft);
  h.window.location.search='?resumeDraft='+nonce;
  assert.equal(h.api.resolveInitialDraftMeta({draftStorageKey:'new',legacyDraftStorageKey:'legacy'}).draft,null);
  h.window.InvoiceRequestIdentity.getAuthSession=()=>({userId:'signed-in'});
  const restored=h.api.resolveInitialDraftMeta({draftStorageKey:'new',legacyDraftStorageKey:'legacy'}).draft;
  assert.equal(restored.lineItems[0].description,'Roof');
  assert.equal(restored.savedInvoiceId,null);
  assert.equal(restored.paymentLinkUrl,'');
  assert.equal(restored.portalAccessToken,'');
  assert.equal(restored.paymentRecords.length,0);
  assert.equal(h.session.size,0);
  assert.equal(draft.savedInvoiceId,'old-owner-record');
});
test('wrong nonce and expired sign-in handoffs cannot replace the account draft',()=>{
  for(const expired of [false,true]) {
    const h=harness();h.local.set('new',JSON.stringify({lineItems:[],notes:'existing'}));
    h.api.rememberSignInDraft({lineItems:[],notes:'pending'});
    h.window.InvoiceRequestIdentity.getAuthSession=()=>({userId:'signed-in'});
    h.window.location.search='?resumeDraft='+(expired?'unique-nonce':'wrong');
    if(expired){const pending=JSON.parse(h.session.get('invoicePendingSignInDraft')!);pending.createdAt=0;h.session.set('invoicePendingSignInDraft',JSON.stringify(pending));}
    assert.equal(h.api.resolveInitialDraftMeta({draftStorageKey:'new',legacyDraftStorageKey:'legacy'}).draft.notes,'existing');
  }
});
