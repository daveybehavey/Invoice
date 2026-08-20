import assert from "node:assert/strict";
import { createHash } from "node:crypto";

import { test } from "node:test";

import {

  LEGAL_OFFER,

  LEGAL_SUPPLIER,

  LEGAL_TERMS_VERSION,

  TERMS_2026_08_12_1_FACTS,

  assertValidTermsAcknowledgement,

  buildTermsDownloadFilename,

  buildTermsPlainText,

  buildTermsSectionsFromFrozenFacts,

  buildVersionedTermsPath,

  clearTermsRegistryOverlaysForTests,

  getCheckoutDisclosureSnapshot,

  getLegalFoundationSnapshot,

  listRegisteredTermsVersions,

  resolveTermsDocument

} from "./services/legalFoundation.js";



test("legal foundation snapshot encodes D1–D6 offer facts", () => {

  const snapshot = getLegalFoundationSnapshot();

  assert.equal(snapshot.termsVersion, LEGAL_TERMS_VERSION);

  assert.match(snapshot.supplier.legalName, /David Heslop/);

  assert.equal(snapshot.supplier.addressLine, "1193 Kangaroo Road, Metchosin, BC V9C 4C9, Canada");

  assert.equal(snapshot.offer.priceDisplay, "$19 USD");

  assert.equal(snapshot.offer.currency, "USD");

  assert.equal(LEGAL_OFFER.goodwillRefundDays, 7);

  assert.equal(LEGAL_SUPPLIER.supportEmail, "support@notebill.app");

  assert.ok(snapshot.cancellationSummary.some((line) => /end of the current paid billing period/i.test(line)));

});



test("terms registry resolves only the registered current version", () => {

  clearTermsRegistryOverlaysForTests();

  assert.deepEqual(listRegisteredTermsVersions(), [LEGAL_TERMS_VERSION]);

  const current = resolveTermsDocument();

  assert.equal(current.version, LEGAL_TERMS_VERSION);

  assert.equal(current.isCurrent, true);

  assert.equal(current.termsUrlPath, buildVersionedTermsPath(LEGAL_TERMS_VERSION));

  assert.equal(resolveTermsDocument(LEGAL_TERMS_VERSION).version, LEGAL_TERMS_VERSION);



  assert.throws(() => resolveTermsDocument("1999-01-01.0"), /Unknown Terms version/i);

  assert.throws(() => resolveTermsDocument("latest"), /Unknown Terms version/i);

});



test("registered Terms 2026-08-12.1 plain text is frozen against alternate facts", () => {

  clearTermsRegistryOverlaysForTests();

  const frozenPlain = buildTermsPlainText("2026-08-12.1");

  assert.match(frozenPlain, /David Heslop, carrying on business as EuroDigital/);

  assert.match(frozenPlain, /NoteBill Pro costs \$19 USD per month/);

  assert.match(frozenPlain, /version 2026-08-12\.1/);



  const mutatedFacts = {

    version: TERMS_2026_08_12_1_FACTS.version,

    effectiveDate: TERMS_2026_08_12_1_FACTS.effectiveDate,

    privacyVersion: "MUTATED_PRIVACY_VERSION_XYZ",

    supplier: {

      ...TERMS_2026_08_12_1_FACTS.supplier,

      legalName: "MUTATED_SUPPLIER_LEGAL_NAME_XYZ"

    },

    offer: {

      ...TERMS_2026_08_12_1_FACTS.offer,

      planName: "MUTATED_PLAN_NAME_ABC",

      priceDisplay: "$999 MUTATED"

    }

  };

  const alternateSections = buildTermsSectionsFromFrozenFacts(mutatedFacts);

  const alternatePlain = alternateSections

    .map((section) => `${section.title}\n${section.paragraphs.join("\n")}`)

    .join("\n\n");

  assert.match(alternatePlain, /MUTATED_SUPPLIER_LEGAL_NAME_XYZ/);

  assert.match(alternatePlain, /MUTATED_PLAN_NAME_ABC/);

  assert.match(alternatePlain, /\$999 MUTATED/);

  assert.match(alternatePlain, /MUTATED_PRIVACY_VERSION_XYZ/);



  const registryAgain = buildTermsPlainText("2026-08-12.1");

  assert.equal(registryAgain, frozenPlain);

  assert.doesNotMatch(registryAgain, /MUTATED_SUPPLIER_LEGAL_NAME_XYZ/);

  assert.doesNotMatch(registryAgain, /MUTATED_PLAN_NAME_ABC/);

  assert.doesNotMatch(registryAgain, /\$999 MUTATED/);

  assert.doesNotMatch(registryAgain, /MUTATED_PRIVACY_VERSION_XYZ/);

});



test("terms plain text and download filename include version identity", () => {

  const plain = buildTermsPlainText(LEGAL_TERMS_VERSION);

  assert.match(plain, new RegExp(`Version: ${LEGAL_TERMS_VERSION}`));

  assert.match(plain, /Effective date: 2026-08-12/);

  assert.match(plain, /15\. Contract copy and version/);

  assert.match(plain, /downloadable\/printable/i);

  assert.doesNotMatch(plain, /15-day/i);

  assert.equal(

    buildTermsDownloadFilename(LEGAL_TERMS_VERSION),

    `notebill-terms-${LEGAL_TERMS_VERSION}.txt`

  );

});



test("checkout disclosure snapshot matches client mirror strings", async () => {

  const disclosure = getCheckoutDisclosureSnapshot();

  assert.equal(disclosure.title, "Review NoteBill Pro before Checkout");

  assert.ok(disclosure.bullets.length >= 5);

  assert.match(disclosure.acknowledgementLabel, /Terms of Service and Privacy Policy/i);

  assert.match(disclosure.acknowledgementLabel, /automatic renewal/i);

  // Client mirror must stay byte-aligned with server disclosure snapshot (no silent drift).

  assert.equal(

    disclosure.bullets[0],

    "NoteBill Pro costs $19 USD per month. Currency is United States dollars (USD)."

  );



  const fs = await import("node:fs/promises");

  const path = await import("node:path");

  const { pathToFileURL } = await import("node:url");

  const clientPath = path.join(process.cwd(), "public", "utils", "legalFoundation.js");

  const clientSource = await fs.readFile(clientPath, "utf8");

  assert.match(clientSource, new RegExp(`LEGAL_TERMS_VERSION = "${LEGAL_TERMS_VERSION}"`));

  assert.match(clientSource, /REGISTERED_TERMS_VERSIONS = \["2026-08-12\.1"\]/);

  // Evaluate client IIFE in a tiny VM-like scope by Function wrapping window export.

  const sandbox: { window: Record<string, unknown> } = { window: {} };

  // eslint-disable-next-line no-new-func

  const runClient = new Function("window", `${clientSource}\nreturn window.InvoiceLegalFoundation;`);

  const client = runClient(sandbox.window) as {

    LEGAL_TERMS_VERSION: string;

    REGISTERED_TERMS_VERSIONS: string[];

    isRegisteredTermsVersion: (version: string) => boolean;

    buildCheckoutDisclosureCopy: () => {

      title: string;

      bullets: string[];

      acknowledgementLabel: string;

    };

    getLegalFoundationClient: () => { termsVersion: string; versionedTermsUrlPath: string };

  };

  assert.equal(client.LEGAL_TERMS_VERSION, LEGAL_TERMS_VERSION);

  assert.deepEqual(client.REGISTERED_TERMS_VERSIONS, [LEGAL_TERMS_VERSION]);

  assert.equal(client.isRegisteredTermsVersion(LEGAL_TERMS_VERSION), true);

  assert.equal(client.isRegisteredTermsVersion("1999-01-01.0"), false);

  const clientDisclosure = client.buildCheckoutDisclosureCopy();

  assert.deepEqual(clientDisclosure, disclosure);

  const clientSnap = client.getLegalFoundationClient();

  assert.equal(clientSnap.termsVersion, LEGAL_TERMS_VERSION);

  assert.equal(clientSnap.versionedTermsUrlPath, buildVersionedTermsPath(LEGAL_TERMS_VERSION));

  assert.equal(pathToFileURL(clientPath).protocol, "file:");

});



test("terms acknowledgement requires current version and accepted true", () => {

  const ok = assertValidTermsAcknowledgement({

    termsVersion: LEGAL_TERMS_VERSION,

    termsAccepted: true

  });

  assert.equal(ok.termsVersion, LEGAL_TERMS_VERSION);

  assert.equal(ok.termsAccepted, true);

  assert.equal(ok.termsAcceptanceMethod, "pre_checkout_disclosure");



  const okString = assertValidTermsAcknowledgement({

    termsVersion: LEGAL_TERMS_VERSION,

    termsAccepted: "true"

  });

  assert.equal(okString.termsAccepted, true);



  assert.throws(

    () =>

      assertValidTermsAcknowledgement({

        termsVersion: "old",

        termsAccepted: true

      }),

    /current Terms/i

  );



  assert.throws(

    () =>

      assertValidTermsAcknowledgement({

        termsVersion: LEGAL_TERMS_VERSION,

        termsAccepted: false

      }),

    /current Terms/i

  );



  assert.throws(

    () =>

      assertValidTermsAcknowledgement({

        termsVersion: LEGAL_TERMS_VERSION

      }),

    /current Terms/i

  );

});

test("registered Terms 2026-08-12.1 body fingerprint is independent of current constants", () => {
  clearTermsRegistryOverlaysForTests();
  // Independent expected digest: hardcoded, not derived from LEGAL_* or TERMS_2026_08_12_1_FACTS.
  const expectedSha256 = "ae2e5e51e0d2fd7ff3fc5e8f31e61950653521f770160a5bddd435458f871c83";
  const expectedLength = 5957;
  const plain = buildTermsPlainText("2026-08-12.1");
  const digest = createHash("sha256").update(plain, "utf8").digest("hex");
  assert.equal(plain.length, expectedLength);
  assert.equal(digest, expectedSha256);
  assert.match(
    plain,
    /^NoteBill Terms of Service\nVersion: 2026-08-12\.1\nEffective date: 2026-08-12\n/
  );
  assert.match(plain, /David Heslop, carrying on business as EuroDigital/);
  assert.match(plain, /NoteBill Pro costs \$19 USD per month/);
  assert.match(plain, /15\. Contract copy and version/);
});
