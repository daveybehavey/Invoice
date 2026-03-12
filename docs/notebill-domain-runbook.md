# NoteBill Public Domain Runbook

This runbook keeps local NoteBill reachable at:

- `https://app.notebill.app`
- `https://notebill.app`
- `https://www.notebill.app`

## Prerequisites

- Cloudflare named tunnel `notebill-app` exists.
- `~/.cloudflared/config.yml` maps all three hostnames to `http://localhost:3000`.
- DNS records exist (proxied CNAME) for:
  - `app.notebill.app`
  - `notebill.app`
  - `www.notebill.app`

## Start Services

Install/refresh user services first (safe to run repeatedly):

```bash
npm run public:install-services
```

```bash
systemctl --user enable --now notebill-dev.service
systemctl --user enable --now notebill-tunnel.service
```

Or use:

```bash
npm run public:start
```

## Check Status

```bash
systemctl --user status notebill-dev.service --no-pager
systemctl --user status notebill-tunnel.service --no-pager
npm run check:launch
npm run check:public-domain
```

`check:launch` verifies:
- local `/health` is reachable
- local `/api/system/launch` reports persistence/auth/billing/delivery/public-base-url readiness in one payload

`check:public-domain` verifies:
- both user services are active
- local app responds on `localhost:3000`
- all three public URLs return HTTP success

## Stop Services

```bash
systemctl --user stop notebill-tunnel.service
systemctl --user stop notebill-dev.service
```

Or use:

```bash
npm run public:stop
```

## Email Routing (Cloudflare)

Cloudflare Email Routing is enabled for `notebill.app` and forwards these aliases to
`davidiheslop@gmail.com`:

- `contact@notebill.app`
- `info@notebill.app`
- `support@notebill.app`
- `hello@notebill.app`
- `billing@notebill.app`
- `sales@notebill.app`

To add another alias later, create a new Email Routing rule in Cloudflare for that
exact address and forward to the same destination mailbox.
