# ONE BOAT Membership / Billing Architecture

Updated: 2026-09-18 JST

## Scope

This document covers only authentication, membership, billing, access control, webhook processing, retention, and recovery. It does not change prediction logic, ENTER rules, bets, stake allocation, historical predictions, race results, or P/L.

## Plans

- FREE
- DAY_PASS: JPY 980, valid for 24 hours from successful payment
- CLUB_MONTHLY: JPY 2,980 per month

## Source of truth

1. Supabase Auth authenticates the user.
2. The browser never chooses or writes membership status.
3. A server-side checkout endpoint chooses the allow-listed Stripe Price ID.
4. Stripe performs card handling and payment processing.
5. Stripe sends a signed webhook.
6. The webhook signature is verified against a signing secret stored in Supabase Vault.
7. Only verified server-side webhook processing updates membership state.
8. Customer-side access reads the effective entitlement derived from server timestamps.

## Stripe production objects

DAY_PASS:
- Product: `prod_VHIXoBkrdCKWs0`
- Price: `price_1UGjwdGRCOYqEb5w88NoV52p`

CLUB_MONTHLY:
- Product: `prod_VHIX9n9WDO5mK6`
- Price: `price_1UGjwhGRCOYqEb5wG09Y5SY0`

Two temporary Payment Links were created during implementation and then disabled. They are not part of the production purchase path. Production must use a unique Stripe Checkout Session per purchase attempt to minimize duplicate-charge risk.

## Supabase tables

- `ob_member_profiles`: age-20 confirmation and acceptance timestamps only.
- `ob_memberships`: current membership state and Stripe external IDs.
- `ob_checkout_intents`: one server-side checkout intent per purchase attempt.
- `ob_purchase_records`: durable minimal billing history.
- `ob_stripe_events`: idempotency log for Stripe event IDs.
- `ob_membership_events`: minimal membership state audit log.
- `ob_billing_config`: server-only allow-list of product / price configuration.
- `ob_membership_daily_backup`: lightweight short-retention recovery snapshot.

Prediction tables and billing tables are intentionally separate.

## Personal data

Stored by ONE BOAT:
- Supabase Auth email
- Internal user UUID
- age-20 confirmation timestamp
- terms/privacy acceptance timestamps
- Stripe external IDs required for reconciliation
- minimal purchase and membership audit records

Not stored by ONE BOAT:
- card number
- card expiry
- CVC
- unnecessary name/address/phone/date-of-birth fields

## RLS / permissions

- All membership/billing public-schema tables have RLS enabled.
- Authenticated users can read only their own profile, membership, purchase records, and effective entitlement.
- Browsers cannot write membership plan/status, Stripe IDs, webhook logs, billing config, or purchase records.
- `service_role` / secret keys are server-only.
- The webhook signature verifier is callable only by the server role.

## Membership states

Current normalized states:
- active
- cancel_at_period_end
- expired
- payment_failed
- inactive

## DAY_PASS

On verified successful payment:
- access begins at successful payment time
- `access_expires_at` = payment time + 24 hours
- expiration is enforced using server/database time
- maintenance cron normalizes expired access

## CLUB_MONTHLY

Stripe subscription state is authoritative.

Typical mapping:
- active/trialing -> active
- active + cancel_at_period_end -> cancel_at_period_end
- past_due/unpaid/incomplete -> payment_failed
- canceled -> expired

`next_billing_at` is synchronized from Stripe subscription period data.

## Webhook events

Registered production endpoint listens to:
- checkout.session.completed
- checkout.session.async_payment_succeeded
- checkout.session.async_payment_failed
- checkout.session.expired
- customer.subscription.created
- customer.subscription.updated
- customer.subscription.deleted
- invoice.paid
- invoice.payment_failed
- charge.refunded

The Stripe signing secret is stored in Supabase Vault and is never committed to GitHub.

## Idempotency / duplicate protection

- `ob_stripe_events.event_id` is the primary idempotency key for webhook retries.
- Stripe Checkout Session, PaymentIntent, invoice, customer, and subscription IDs use uniqueness constraints where appropriate.
- Active pending checkout intent constraints prevent accidental parallel purchase attempts.
- The final production checkout path must create one unique Stripe Checkout Session per purchase attempt.

## Expiry / retention

- Membership maintenance runs every 15 minutes.
- Old transient checkout/event data is pruned.
- Durable purchase history remains minimal.
- Lightweight membership recovery snapshots are retained for a short window.

## Recovery

The Supabase project is currently on the Free plan, so full managed PITR is not available. Membership data has a lightweight DB snapshot mechanism, but a production launch should still consider an external backup or a Supabase plan with managed backup/PITR.

## Edge Functions

- `one-boat-membership-api`
  - user-scoped membership lookup
  - eligibility confirmation
  - checkout intent creation
  - unique Stripe Checkout Session creation once `STRIPE_SECRET_KEY` is configured server-side
  - customer portal / cancellation / account deletion paths

- `one-boat-stripe-webhook`
  - no JWT requirement because Stripe calls it directly
  - validates Stripe signature using the Supabase Vault-backed verifier before any DB mutation
  - applies idempotent membership and purchase updates

## Launch gate

Keep `ob_billing_config.active = false` until all of the following are true:

1. A restricted Stripe server API key is stored as the Supabase Edge Function secret `STRIPE_SECRET_KEY`.
2. The membership API health check confirms Stripe is configured.
3. Stripe Customer Portal cancellation behavior is configured for period-end cancellation.
4. End-to-end live/safe test passes: signup, email confirmation, login, checkout, webhook, entitlement, renewal, cancellation, failure, replay, direct paid-URL access, cross-user access, logout, account deletion.
5. Only after those checks, activate billing config.

## Known unrelated security findings

Supabase Security Advisor currently reports security findings on legacy prediction/backtest tables and public security-definer RPCs. Those are outside this membership implementation and were intentionally not modified here because prediction/history scope is frozen. They must be handled as a separate infrastructure hardening task.
