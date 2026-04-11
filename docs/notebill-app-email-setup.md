# notebill.app Email Setup Runbook

Last reviewed: 2026-04-10

## Goal

Set up these addresses so they all forward to `davidiheslop@gmail.com`:

- `support@notebill.app`
- `contact@notebill.app`
- `info@notebill.app`
- `david@notebill.app`

Also enable sending from a `@notebill.app` address for the app.

## Recommended architecture

Use:

- Cloudflare Email Routing for inbound forwarding
- SMTP2GO for outbound sending from the app

Why this is the best fit now:

- You already added `notebill.app` as a sender domain in SMTP2GO
- Cloudflare Email Routing is good for forwarding inbound aliases to Gmail
- The app now supports SMTP2GO as an outbound provider

## Inbound mail

Create or confirm these Cloudflare Email Routing rules:

- `support@notebill.app` -> `davidiheslop@gmail.com`
- `contact@notebill.app` -> `davidiheslop@gmail.com`
- `info@notebill.app` -> `davidiheslop@gmail.com`
- `david@notebill.app` -> `davidiheslop@gmail.com`

## Outbound mail

Use SMTP2GO to send application email.

Recommended sender options:

- Simpler: `support@notebill.app`
- Better for app/system mail: `invoices@notebill.app`

For launch, either is fine. If you want the cleanest split, use `support@notebill.app` for human contact and `invoices@notebill.app` for app-generated mail.

## App configuration after SMTP2GO is ready

Set these environment values:

```env
INVOICE_EMAIL_PROVIDER=smtp2go
INVOICE_FROM_EMAIL=NoteBill <support@notebill.app>
SMTP2GO_API_KEY=your_smtp2go_api_key
INVOICE_LAUNCH_TEST_EMAIL=davidiheslop@gmail.com
APP_BASE_URL=https://app.notebill.app
```

Alternative sender:

```env
INVOICE_FROM_EMAIL=NoteBill <invoices@notebill.app>
```

## Verification checklist

- Send a test email to each alias from a non-Gmail address and confirm it lands in `davidiheslop@gmail.com`
- Confirm `notebill.app` is verified in SMTP2GO
- Confirm SPF and DKIM records from SMTP2GO are live in Cloudflare DNS
- Send a provider-backed launch test from the app
- Confirm the message arrives and the sender address shows your chosen `@notebill.app` address

## DMARC starter record

Start with a monitoring-only DMARC policy:

```txt
Host: _dmarc
Type: TXT
Value: v=DMARC1; p=none; rua=mailto:dmarc@notebill.app;
```

If you do not want to create `dmarc@notebill.app` yet, remove the `rua` portion temporarily.

## Optional Gmail quality-of-life step

If you want to manually send from Gmail as `support@notebill.app`, later configure Gmail "Send mail as" using SMTP credentials from SMTP2GO.

That is separate from the app’s outbound mail setup.

## Sources

- Cloudflare Email Routing overview: https://developers.cloudflare.com/email-routing/
- Cloudflare Email Routing setup: https://developers.cloudflare.com/email-routing/get-started/enable-email-routing/
- SMTP2GO verified senders: https://support.smtp2go.com/hc/en-gb/articles/115004408567-Verified-Senders
- SMTP2GO Cloudflare DNS setup: https://support.smtp2go.com/hc/en-gb/articles/360022578154-DNS-Setup-for-Cloudflare
