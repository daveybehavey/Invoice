import assert from "node:assert/strict";

import test from "node:test";

import {

  clearContractCopyRateLimitForTests,

  deliverContractCopy,

  setContractCopyEmailSenderForTests

} from "./services/contractCopyDelivery.js";

import {

  LEGAL_TERMS_VERSION,

  clearTermsRegistryOverlaysForTests,

  registerTermsDocumentForTests

} from "./services/legalFoundation.js";



test.afterEach(() => {

  clearContractCopyRateLimitForTests();

  clearTermsRegistryOverlaysForTests();

  setContractCopyEmailSenderForTests(null);

});



test("deliverContractCopy embeds exact version text and download URL", async () => {

  const sent: Array<{ text: string; html: string; to: string }> = [];

  setContractCopyEmailSenderForTests(async (input) => {

    sent.push(input);

    return { messageId: "msg_unit_1" };

  });



  const result = await deliverContractCopy({

    email: "owner@test.dev",

    userId: "usr_contract_1",

    termsVersion: LEGAL_TERMS_VERSION,

    baseUrl: "https://app.test"

  });



  assert.equal(result.delivered, true);

  assert.equal(result.channel, "email");

  assert.equal(result.emailConfigured, true);

  assert.equal(result.termsVersion, LEGAL_TERMS_VERSION);

  assert.equal(

    result.termsUrl,

    `https://app.test/terms?version=${encodeURIComponent(LEGAL_TERMS_VERSION)}`

  );

  assert.match(result.downloadUrl, /\/api\/legal\/documents\/terms\?version=/);

  assert.match(result.downloadUrl, /format=txt/);

  assert.equal(sent.length, 1);

  assert.match(sent[0]!.text, new RegExp(`Version: ${LEGAL_TERMS_VERSION}`));

  assert.match(sent[0]!.text, /Download plain-text Terms/);

  assert.match(sent[0]!.html, /Download plain-text Terms/);

});



test("deliverContractCopy rejects unknown Terms versions before cache", async () => {

  setContractCopyEmailSenderForTests(async () => ({ messageId: "should_not_send" }));



  await assert.rejects(

    () =>

      deliverContractCopy({

        email: "owner@test.dev",

        userId: "usr_contract_unknown",

        termsVersion: "1999-01-01.0",

        baseUrl: "https://app.test"

      }),

    /Unknown Terms version/i

  );

});



test("deliverContractCopy coalesces repeated requests for the same user+version", async () => {

  let sends = 0;

  setContractCopyEmailSenderForTests(async () => {

    sends += 1;

    return { messageId: `msg_${sends}` };

  });



  const first = await deliverContractCopy({

    email: "owner@test.dev",

    userId: "usr_contract_rate",

    termsVersion: LEGAL_TERMS_VERSION,

    baseUrl: "https://app.test"

  });

  const second = await deliverContractCopy({

    email: "owner@test.dev",

    userId: "usr_contract_rate",

    termsVersion: LEGAL_TERMS_VERSION,

    baseUrl: "https://app.test"

  });



  assert.equal(first.delivered, true);

  assert.equal(second.coalesced, true);

  assert.equal(second.messageId, first.messageId);

  assert.equal(sends, 1);

});



test("deliverContractCopy does not coalesce different Terms versions for the same user", async () => {

  const dispose = registerTermsDocumentForTests({

    version: "2099-01-01.0",

    effectiveDate: "2099-01-01",

    sections: [

      {

        title: "1. Stub",

        paragraphs: ["Test-only Terms stub for coalescing isolation."]

      }

    ]

  });

  try {

    let sends = 0;

    setContractCopyEmailSenderForTests(async () => {

      sends += 1;

      return { messageId: `msg_${sends}` };

    });



    const first = await deliverContractCopy({

      email: "owner@test.dev",

      userId: "usr_contract_cross_version",

      termsVersion: LEGAL_TERMS_VERSION,

      baseUrl: "https://app.test"

    });

    const second = await deliverContractCopy({

      email: "owner@test.dev",

      userId: "usr_contract_cross_version",

      termsVersion: "2099-01-01.0",

      baseUrl: "https://app.test"

    });



    assert.equal(first.delivered, true);

    assert.equal(second.delivered, true);

    assert.notEqual(second.coalesced, true);

    assert.equal(second.termsVersion, "2099-01-01.0");

    assert.equal(sends, 2);

    assert.notEqual(second.messageId, first.messageId);

  } finally {

    dispose();

  }

});
