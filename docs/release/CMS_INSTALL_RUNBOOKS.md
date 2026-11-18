# CMS install runbooks

For a non-developer operator. Do these only after the site's row in the
readiness report says its origin is allowlisted and tested. Until then the tag
is harmless but shows nothing.

These steps describe the vendors' normal custom-script paths. **None has been
exercised with a Dial admin login** — menu names may differ; where they do,
ask the vendor's support for "a site-wide custom script before the closing
body tag".

## Before you start (every site)

1. Open the site in a browser. Copy the address-bar origin exactly
   (`https://www.example.com`). It must equal the "Origin to allowlist" in the
   install kit. If it differs, stop and report it.
2. Open the site's `*.production.html` file and copy the single `<script …>` line.

## DealerOn — Dial Chevy of Chicago (vendor verified from response headers)

DealerOn customers usually cannot edit templates directly.

1. Open a DealerOn support ticket (or use the CMS "Custom Scripts / Tag
   Manager" area if your login has it).
2. Ask: "Add this script site-wide, before `</body>`, on all pages. It loads
   with `defer` and does not change page design."
3. Paste the one line. Do not let support rewrite it or add `async`/`integrity`.
4. If the site already uses Google Tag Manager, use the GTM path below
   instead — not both.

## Team Velocity / Apollo — Jeep of Chicago (verified); Nissan, INFINITI, CDJR South (vendor unverified)

1. Email the Team Velocity performance manager / support.
2. Ask for the tag to be added as a site-wide body-end script on that one
   rooftop only.
3. Send the single line for that rooftop. Each rooftop has a different
   `data-tenant`; never reuse one rooftop's line on another site.

Existing vendor request drafts: `docs/vendor-handoff/team-velocity/`.

## Google Tag Manager (any site that has it)

1. New tag → Custom HTML → paste the one line.
2. Trigger: All Pages. Leave "Support document.write" off.
3. **Preview** first; confirm the launcher appears and one conversation works.
4. Publish. To roll back: pause the tag and publish.

Note: inside GTM the loader finds itself by `data-tenant`, which GTM preserves.

## Group site — Dial Auto Group (CMS unverified)

Do not install yet. The vendor is not confirmed and the group assistant has no
store selector. When unblocked, follow the runbook for whichever vendor hosts it.

## After install (every site)

1. Hard-refresh the page. The launcher appears; open it; ask "What are your hours?"
2. Confirm the store name in the header is this rooftop.
3. Confirm the rest of the page looks unchanged at desktop and phone width.
4. Record date, who installed, and the `commitSha` from
   `https://widget.dialusnow.com/version.json` in the UAT sheet.

## Privacy / consent wording

The widget shows the tenant's configured consent text before collecting
contact details. Do not add separate wording in the CMS; change it in the
tenant configuration so it stays consistent and audited. Legal review of the
consent text is the dealer's responsibility.
