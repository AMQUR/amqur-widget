# Jeep of Chicago — GTM canary deployment package

**Status:** READY FOR OPERATOR APPLICATION — **not published**  
**Domain:** `www.jeepofchicago.com`, `jeepofchicago.com`  
**Do not enable on other Dial Auto Group domains.**

## Access discovery (this machine)

| Check | Result |
|---|---|
| `gcloud` CLI | UNAVAILABLE |
| Application Default Credentials | absent |
| GTM API auth | absent |
| Keychain GTM/TeamVelocity secrets | not found (AMQUR Staging JWT/Bootstrap only; “Dial Jeep Corp” label observed elsewhere but not usable as GTM API) |
| Railway GTM vars | absent |
| GitHub Actions GTM secrets | absent |

**Unavoidable authorization required:** Google account with publish rights on the observed GTM containers, or TeamVelocity ticket (see sibling doc).

## Observed public GTM containers

`GTM-MP5XGBXQ`, `GTM-MV862RN`, `GTM-NFTX3XB`, `GTM-PZR8D88Z`, `GTM-TPV8SZS7`, `GTM-WQP4BHQ4`

Operator must confirm which container owns site-wide tags before publishing.

## Tag definitions

### Shared assets
- Loader: `docs/deployment/amqur-canary-loader.js` (host on approved HTTPS CDN; optional SRI)
- Snippets: `docs/deployment/snippets/level*.html`

### Tag: `AMQUR — Level 0 Emergency Disable`
- Type: Custom HTML  
- HTML: `snippets/level0-disabled.html`  
- Trigger: Manual / emergency only  
- Priority: highest  

### Tag: `AMQUR — Level 1 Employee`
- Type: Custom HTML  
- HTML: `snippets/level1-employee.html` + loader  
- Trigger: All Pages  
- Exceptions: hostname does not match jeepofchicago.com  
- Additional condition: Cookie `amqur_emp` equals `1` **OR** Query `amqur_employee` present  
- Consent: not required (no CMP detected on public HTML as of 2026-07-11)  
- Fire once per page: yes  
- Sequencing: after GTM base; async script only  

### Tag: `AMQUR — Level 2 Canary 1%`
- HTML: `snippets/level2-one-percent.html`  
- Trigger: All Pages + hostname allowlist  
- Exception: Cookie `amqur_canary_kill=1`  
- Only one AMQUR level tag enabled at a time  

### Levels 3–5
Same pattern with `level3` / `level4` / `level5` snippets. Never enable inventory-backed claims without live authorized inventory.

## Hostname restriction

Fire only when `Page Hostname` matches:
- `www.jeepofchicago.com`
- `jeepofchicago.com`

## Preview verification steps

1. GTM Preview on jeepofchicago.com  
2. Confirm Level 0 does nothing harmful when not published  
3. Enable Level 1 in preview only; without employee cookie → no `amqur-widget` network call  
4. With employee cookie on **labeled internal test page** only if using staging API — never fixture inventory on public hostname  
5. Expected console: `[AMQUR] hostname_rejected` or `missing_hosts` until production hosts set (fail closed)  
6. Expected network when hosts set: GET versioned IIFE; POST `/api/public/widget-token` with Origin `https://www.jeepofchicago.com`  
7. Unauthorized Origin must 403  

## Publish verification

1. Publish container version with note `AMQUR canary level N`  
2. Synthetic checks from allowlisted machine  
3. Watch bootstrap / token / error rates  
4. Rollback: publish previous container version OR publish Level 0  

## Expected network requests (when provisioned)

- `GET https://<cdn>/.../amqur-widget.iife.js`  
- `GET/POST https://<api>/api/public/widget-config`  
- `POST https://<api>/api/public/widget-token`  

## Known error signatures

| Console / network | Meaning |
|---|---|
| `missing_hosts` | apiBaseUrl/assetUrl not set — correct fail-closed |
| `hostname_rejected` | wrong domain |
| `duplicate_blocked` | GTM fired twice — safe |
| `employee_gate_denied` | Level 1 gate working |
| `canary_bucket_miss` | user outside % |
| HTTP 403 widget-token | Origin allowlist working |

## Rollback procedure

1. Pause/unpublish AMQUR tags **or** publish Level 0  
2. Set server `featureFlags.chat=false` for location  
3. Revert CDN `latest` to prior IIFE if needed  

## Release rule

Do **not** publish Level 2+ until: production API/CDN set, handoff destination verified, alerts routed, public inventory remains disabled (no live vAuto).
