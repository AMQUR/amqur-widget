# Manual screen-reader test (human required)

Status: **NOT TESTED**. Nobody has run this widget with a real screen reader. The automated
checks below prove what a screen reader is *given*; they cannot prove how it sounds or whether
the order makes sense to a person. This script is the remaining acceptance step and must be run
by a person before the widget is installed on a customer-facing site.

## What is already verified automatically (Chromium, Firefox and WebKit)

- axe WCAG 2.2 A/AA: no violations across the journey states, both themes.
- Keyboard: open, Tab stays inside the dialog (including Safari's default Tab behaviour),
  Escape closes, focus returns to the launcher.
- Screen-reader contract (`e2e/sandbox/sales-desk.spec.ts`, "screen-reader contract"): the
  launcher is a named button; the panel is a named modal dialog; the transcript is a polite live
  log that is not left busy; the text box and send control are named; every lead-form field and
  consent box has an accessible name; consent boxes start unticked; a failed submit raises an
  alert, marks the field invalid, links it to its message and moves focus to it; vehicle
  pictures have text alternatives; no control is an unnamed icon.
- Touch targets at least 44px at 320px wide; reduced motion disables animation.

## How to run

Local sandbox, no backend needed: `npm ci && npm run build && node e2e/sandbox/sandbox-server.mjs`,
then open `http://127.0.0.1:18090/?tenant=dial-auto-group&theme=showroom`.

Test each row with **VoiceOver + Safari (macOS)**, **VoiceOver + Safari (iOS)**,
**TalkBack + Chrome (Android)** and **NVDA + Firefox or Chrome (Windows)**. Record pass/fail and
what was actually spoken.

| # | Do | Expected |
|---|---|---|
| 1 | Move to the launcher | Announced as a button, "Open assistant" |
| 2 | Activate it | Focus moves into a dialog named for the store and "AI assistant"; the rest of the page is not reachable while it is open |
| 3 | Read the greeting | It says it is an AI assistant before asking for anything |
| 4 | Type "either grand cherokee" and send | The reply is announced once, after it finishes, not word by word and not twice |
| 5 | Move through the vehicle carousel | Each vehicle is one group: year, make, model, store that has it, price, "Demo vehicle"; position ("2 of 4") is announced when moving |
| 6 | Open "Payment" on a card | The estimate is read with "estimate, not a financing offer"; the terms are reachable |
| 7 | Ask for a test drive | A form is announced with the store's name; each field's label, required state and the three consent boxes (unticked) are read |
| 8 | Submit empty | An error summary is announced; focus lands on the first problem and its message is read |
| 9 | Fill, tick one consent, submit | The transcript says contact details were sent; the email address itself is not read back |
| 10 | Choose a time | Times are read with day and time zone; the selected time is announced as selected |
| 11 | Book | "Appointment confirmed" is read only with a confirmation number, and it says it is a demo booking |
| 12 | Ask for a person | The staff bar is announced once: who joined and that the AI assistant is paused |
| 13 | Press Stop during a long reply ("slow") | "Reply stopped" is announced; focus stays in the text box |
| 14 | Switch language with the ES/EN button | The button's name says what it will do; following replies are read with the right language voice |
| 15 | Trigger an error ("trigger-error") | The error and the Retry button are announced; nothing claims success |
| 16 | Press Escape | The dialog closes and focus returns to the launcher |
| 17 | Zoom to 200% and 400% | Nothing is cut off; no horizontal scrolling inside the panel |

Record the result in `docs/evidence/` with date, tester, device, OS and screen-reader versions.
Any failure in rows 2, 7, 8, 11 or 12 blocks a customer-facing install.
