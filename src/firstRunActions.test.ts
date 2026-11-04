import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { test } from 'node:test';
const source = readFileSync('public/features/intake/aiIntake.jsx', 'utf8');
const handler = source.slice(source.indexOf('  const handleOnboardingContinue ='), source.indexOf('  const handleDismissWalkthrough ='));
function run(step: string, overrides = {}) {
  const calls: unknown[][] = [];
  const context = {
    isTyping: false, intakePhase: 'collecting', followUp: null, inputValue: '',
    hasReviewCard: false, finishedInvoice: null, canGenerateInvoice: false,
    ctaHelper: 'Resolve pricing first', SAMPLE_JOB_NOTES: 'sample', decisionsRef: {},
    ...Object.fromEntries(['setOnboardingActionNotice','handleSubmitUserMessage','handleLoadStarterSample',
      'focusInputWithValue','handleGenerateInvoice','setReviewCardCollapsed','scrollToSection','navigate']
      .map(name => [name, (...args: unknown[]) => calls.push([name, ...args])])),
    ...overrides
  };
  vm.runInNewContext(`${handler}\nhandleOnboardingContinue({id: '${step}'});`, context);
  return calls;
}
test('next step loads empty notes and submits typed notes', () => {
  assert.ok(run('capture_notes').some(c => c[0] === 'handleLoadStarterSample'));
  for (const step of ['capture_notes', 'review_draft']) {
    assert.ok(run(step, {inputValue: 'Unique job'}).some(c => c[0] === 'handleSubmitUserMessage' && c[1] === 'Unique job'));
  }
});
test('busy next step explains wait without duplicate submission', () => {
  const calls = run('review_draft', {isTyping: true, inputValue: 'job'});
  assert.ok(calls.some(c => c[0] === 'setOnboardingActionNotice' && String(c[1]).includes('wait')));
  assert.ok(!calls.some(c => c[0] === 'handleSubmitUserMessage'));
});
test('pricing next step focuses missing answer or submits supplied answer', () => {
  const state = {intakePhase: 'awaiting_follow_up', followUp: {message: 'Hours?'}};
  assert.ok(run('open_editor', state).some(c => c[0] === 'setOnboardingActionNotice' && c[1] === 'Hours?'));
  assert.ok(run('open_editor', {...state, inputValue: '3 hours'}).some(c => c[0] === 'handleSubmitUserMessage'));
});
test('missing draft explains recovery and unresolved review cannot open editor', () => {
  assert.ok(run('open_editor').some(c => c[0] === 'setOnboardingActionNotice' && String(c[1]).includes('unavailable')));
  const blocked = run('open_editor', {finishedInvoice: {}, hasReviewCard: true});
  assert.ok(blocked.some(c => c[0] === 'setReviewCardCollapsed'));
  assert.ok(!blocked.some(c => c[0] === 'handleGenerateInvoice'));
  assert.ok(run('open_editor', {finishedInvoice: {}, canGenerateInvoice: true}).some(c => c[0] === 'handleGenerateInvoice'));
});
