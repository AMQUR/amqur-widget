# TeamVelocity / dealer.com — Jeep of Chicago script request

**Status:** Template ready — **not submitted** (no TeamVelocity API or portal credential on this machine)

## Request summary

| Field | Value |
|---|---|
| Dealership | Jeep of Chicago / CDJR of Chicago |
| Domain | https://www.jeepofchicago.com |
| Dealer code (observed public) | `chryslerdodgejeepramofchicagoilcllc` |
| Environment | Production canary (start unpublished / employees only) |
| Script placement | Site-wide footer or tag manager equivalent |
| Async/defer | **async required**; must not block render |
| Page scope | All public pages on jeepofchicago.com hostnames only |
| Tenant slug | `dial-auto-group` |
| Location slug | `jeep-of-chicago` |
| Widget asset URL | **TBD — provisioned HTTPS CDN only** |
| API base URL | **TBD — provisioned HTTPS API only** |
| CSP | No CSP header observed 2026-07-11; if CSP added, allow script-src + connect-src for API/CDN hosts |
| Consent | No CMP detected on public homepage; revisit if CMP added |
| Duplicate chat risk | Existing chat/messaging fingerprints observed — coordinate z-index and single-assistant policy |

## Script requirements

1. Load `amqur-canary-loader.js` asynchronously from approved CDN.  
2. Set `window.__AMQUR_CANARY_CFG__` per level docs before loader.  
3. Hostname allowlist enforced in loader.  
4. Kill switch: `?amqur_canary_kill=1` or localStorage.  
5. No secrets in page source.  

## Rollback

Remove or disable the AMQUR script entry in TeamVelocity; confirm network shows no AMQUR asset requests within 5 minutes.

## Test plan (after install in non-public preview if available)

- [ ] Wrong host does not initialize  
- [ ] Duplicate load safe  
- [ ] Token Origin restricted  
- [ ] Inventory features disabled in public mode  
- [ ] Tekion/vAuto remain off  
- [ ] Handoff destination receives **approved test** only  
- [ ] Mobile layout OK  
- [ ] No CWV regression beyond agreed budget  

## Technical contacts (fill before submit)

| Role | Name | Email |
|---|---|---|
| AMQUR engineering | | |
| Dealership digital | | |
| TeamVelocity CSM | | |

## Exact support email body

```
Subject: Script install request — AMQUR canary — jeepofchicago.com ONLY

Please add an async third-party script for Chrysler Dodge Jeep RAM / Jeep of Chicago
(dealerCode chryslerdodgejeepramofchicagoilcllc) limited to hostnames:
- www.jeepofchicago.com
- jeepofchicago.com

Do not deploy to other Dial Auto Group sites.

Initial mode: DISABLED / employee-gated only until we confirm.
We will provide final HTTPS asset URL + config JSON at install time.
Rollback: remove the script entry.

Contact: <AMQUR engineering email>
```

**Do not invent a TeamVelocity API.** Prefer GTM if the dealership grants container publish access first.
