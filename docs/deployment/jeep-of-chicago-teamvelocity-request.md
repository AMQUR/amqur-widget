# TeamVelocity / Apollo — Jeep of Chicago script request

**Status:** Path C **selected**. Apollo Tracking Pixel **AMQUR Internal Employee Canary** manually saved with **Is Enabled = False** (revalidated 2026-07-14).

**Do not enable** until: (1) handoff destination set securely + synthetic handoff passes (backend#8), (2) signed business approval.  
**Do not** also install via GTM-MP5XGBXQ.

Handoff authorization request (dealership ops): `backend/docs/dealership-knowledge/JEEP_OF_CHICAGO_HANDOFF_AUTHORIZATION_REQUEST.md`  
Approval package: `backend/docs/JEEP_OF_CHICAGO_INTERNAL_CANARY_APPROVAL.md`

## Apollo entry (verify — keep disabled)

| Field | Expected |
|---|---|
| Website | www.jeepofchicago.com |
| Tag name | AMQUR Internal Employee Canary |
| Placement | All Pages Body |
| Vendor | Other |
| Include on Iframes | False |
| Exclude from conversion pages | False |
| **Is Enabled** | **False** |
| Loader | `https://widget-staging-staging.up.railway.app/amqur-canary-loader.js` |
| Widget asset | `https://widget-staging-staging.up.railway.app/amqur-widget.1e34c88.iife.js` |
| API | `https://backend-staging-staging-b699.up.railway.app` |
| Pixel ID | Record from Apollo UI if visible (no secrets) |

## Request summary

| Field | Value |
|---|---|
| Dealership | Jeep of Chicago / CDJR of Chicago |
| Domain | https://www.jeepofchicago.com |
| Dealer code (observed public) | `chryslerdodgejeepramofchicagoilcllc` |
| Environment | Staging-backed employee canary only (Apollo disabled until gates) |
| Script placement | Apollo Tracking Pixel · All Pages Body |
| Async/defer | **async required**; must not block render |
| Page scope | jeepofchicago.com hostnames only |
| Tenant slug | `dial-auto-group` |
| Location slug | `jeep-of-chicago` |
| Employee gate | Backend signed HttpOnly cookie + `/api/public/canary-eligibility` — **never** client-writable flags in Apollo |

## Script requirements

1. Load `amqur-canary-loader.js` asynchronously from approved CDN.  
2. Set `window.__AMQUR_CANARY_CFG__` per level docs before loader (mode `employee` for Level 1).  
3. Hostname allowlist enforced in loader.  
4. Kill switch: `?amqur_canary_kill=1` or localStorage.  
5. No secrets / no invite tokens / no canary session JWTs in Apollo payload.  

## Rollback

Disable or remove the AMQUR Apollo Tracking Pixel; confirm network shows no AMQUR asset requests within 5 minutes. Server kill: `CANARY_EMPLOYEE_ENABLED=false`.

## Test plan (Apollo still disabled — use staging redeem host)

- [ ] Redeem invite on staging `/canary-redeem.html`  
- [ ] Eligibility succeeds only with valid cookie + Jeep/staging allowlisted Origin  
- [ ] Public session without cookie denied  
- [ ] Forged / expired / wrong tenant-rooftop-env fail  
- [ ] Wrong host does not initialize  
- [ ] Inventory / Tekion / vAuto remain off  
- [ ] Handoff destination receives **approved test** only (after #8)  

## Exact support email body (historical template)

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

Apollo UI path supersedes email when available. Prefer keeping pixel disabled until gates pass.
