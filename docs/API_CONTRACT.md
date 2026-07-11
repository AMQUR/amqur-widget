# API contract (widget copy)

See backend `docs/API_CONTRACT.md` for the canonical table.

Widget consumes Nest envelopes `{ success, data }` via `unwrapApiData`.

Chat request: `{ message, conversationId?, action?, vin? }`  
Chat responses: `reply` | `vehicle_carousel` | `vehicle_compare` | `vehicle_detail` | `payment_summary` (+ optional `provenance`).

Feature flags from bootstrap: `features.chat`, `features.inventory`, `features.payments`.
