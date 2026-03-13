import "dotenv/config";
import process from "node:process";
import { getInvoiceEmailCapabilities, sendLaunchTestEmail } from "../src/services/invoiceEmailDelivery.js";

async function main() {
  const recipientEmail = (process.env.INVOICE_LAUNCH_TEST_EMAIL ?? "").trim().toLowerCase();
  if (!recipientEmail) {
    throw new Error("INVOICE_LAUNCH_TEST_EMAIL is required.");
  }

  const capabilities = getInvoiceEmailCapabilities();
  if (!capabilities.configured) {
    throw new Error("Invoice email delivery is not configured. Set INVOICE_EMAIL_PROVIDER/RESEND_API_KEY first.");
  }

  const result = await sendLaunchTestEmail({
    recipientEmail,
    appBaseUrl: process.env.APP_BASE_URL
  });

  console.log(
    JSON.stringify(
      {
        ok: true,
        recipientEmail: result.recipientEmail,
        provider: result.provider,
        mode: result.mode,
        providerMessageId: result.providerMessageId ?? null,
        warning: result.warning ?? null
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(
    JSON.stringify(
      {
        ok: false,
        error: error instanceof Error ? error.message : String(error)
      },
      null,
      2
    )
  );
  process.exitCode = 1;
});
