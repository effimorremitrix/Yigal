# Registering the Tidelane app on developer.intuit.com

QuickBooks Online has no API key. It only speaks OAuth 2.0, so a live connection needs an *app*
registered on [developer.intuit.com](https://developer.intuit.com); that app issues a client ID and
secret and holds a whitelist of redirect URIs. Nothing else about it matters to Tidelane.

The worker already implements the whole flow (`worker/integrations/quickbooks/oauth.ts`,
`worker/integrations/api.ts`). This document is the portal half: what to click, what to copy, and
where each value goes afterwards.

Everything below is derived from the code, not from memory of Intuit's documentation. If the portal
disagrees with this file, the portal is right and this file needs an edit.

## The values the app must carry

| | Value |
|---|---|
| Scope | `com.intuit.quickbooks.accounting`; Accounting only, nothing else |
| Redirect URI, production | `https://yigal.effi-mor-e04.workers.dev/api/integrations/quickbooks/oauth/callback` |
| Redirect URI, local | `http://localhost:8787/api/integrations/quickbooks/oauth/callback` |
| Host / launch URL, if asked | `https://yigal.effi-mor-e04.workers.dev/` |

The redirect URI is not configured anywhere in Tidelane. The worker derives it from the origin the
browser is on (`redirectUriFor`, `worker/integrations/api.ts`), and the QuickBooks card in
**Settings → Integrations** prints the exact string for whatever origin you are looking at. Copy it
from there rather than from here, and start the sign-in from the worker origin, never from the Vite
dev server on `:5173`.

**If Tidelane ever moves off `workers.dev` to a domain Yigal owns, the redirect URI changes.**
Register the new one before the next Connect, or the code exchange fails.

## Before you start

- An Intuit account. For now this is Effi's; see [Handing the app to Yigal](#handing-the-app-to-yigal).
- `CREDENTIALS_KEY` set on the worker (`npx wrangler secret put CREDENTIALS_KEY`). Without it the
  sign-in refuses to start and the card returns `reason=not_configured`.
- An admin login to Tidelane.

## Step 1: create the app

1. Sign in at developer.intuit.com and open the dashboard.
2. Create an app, choosing the **QuickBooks Online and Payments** platform.
3. Select the **Accounting** scope. Do not add Payments or any OpenID scope; the worker requests
   `com.intuit.quickbooks.accounting` and nothing else, and a scope the app does not hold is simply
   refused at the consent screen.
4. Name it `Tidelane`.

## Step 2: Development keys

Under **Keys & credentials → Development**:

1. Copy the client ID and client secret.
2. Register both redirect URIs from the table above.

Intuit accepts `http://localhost` redirect URIs for development keys. If it refuses, use the paste
path for local work instead: take a realm id and refresh token from Intuit's OAuth 2.0 Playground
and type all four values into the card by hand.

## Step 3: Production keys

Production keys are gated behind Intuit's app assessment: a questionnaire plus an EULA URL, a privacy
policy URL, a host domain and a contact. The questions are about the app and how it handles data,
not about Yigal's books. **Start this early.** It is the step with a lead time, and the live pull
against Yigal's real company is scheduled for 29 September.

Once the keys are issued, register the production redirect URI (https only) and copy the production
client ID and secret. Keep them clearly separated from the development pair; they look identical and
mixing them produces a `token_exchange` failure with no useful message.

## Step 4: where the values go

Nothing from Intuit is committed to this repository. The client ID and secret are typed into
**Settings → Integrations → QuickBooks**, encrypted with AES-GCM before they reach D1, and never
returned by the API. Optionally they can also live as deployment fallbacks
(`npx wrangler secret put QUICKBOOKS_CLIENT_ID`), which anything saved in the UI overrides.

The base URL is what selects the environment. It is the *only* sandbox/production switch: the
authorize and token endpoints are the same for both.

| Key set | `QUICKBOOKS_BASE_URL` | Company you will be connecting |
|---|---|---|
| Development | `https://sandbox-quickbooks.api.intuit.com` | an Intuit sandbox company |
| Production | `https://quickbooks.api.intuit.com` | Yigal's real QuickBooks company |

A mismatch, production keys against the sandbox host or the reverse, fails at **Test connection**.

## Step 5: connect and verify

1. Save the base URL, `QUICKBOOKS_CLIENT_ID` and `QUICKBOOKS_CLIENT_SECRET` on the card.
   **Connect to QuickBooks** stays disabled until all three are present.
2. Press **Connect to QuickBooks**. The worker stores a single-use state for ten minutes and sends
   you to Intuit's consent screen.
3. Approve. Intuit returns the realm id (the company id) and an authorization code; the callback
   exchanges the code and stores the realm id and refresh token encrypted. The page comes back with
   `?quickbooks=connected`, or `?quickbooks=error&reason=...`.
4. Switch **Mode** to Live. This is refused unless all five values are present.
5. Press **Test connection**. It reports the connected company name; check that it is the company
   you expected, particularly after a sandbox/production swap.
6. Pull invoices from the Invoices page.

Access tokens last an hour and are cached per isolate. Intuit rotates the refresh token, and the
worker writes the new one back encrypted, which is why `CREDENTIALS_KEY` is required for anything
beyond a one-off trial: an env-only refresh token cannot be updated and eventually fails with a
"reconnect" message.

## Step 6: swapping sandbox and production

Tidelane holds one credential set at a time. To move from the sandbox company to the real one:

1. Overwrite the base URL with the production host.
2. Overwrite `QUICKBOOKS_CLIENT_ID` and `QUICKBOOKS_CLIENT_SECRET` with the production pair, and save.
3. Press **Connect to QuickBooks** again and approve against the real company.

Step 3 is not optional. The stored realm id and refresh token are replaced only when a callback
completes, so skipping it leaves production credentials pointing at a sandbox company id, and
**Test connection** fails. The same sequence in reverse goes back to the sandbox.

## Handing the app to Yigal

The app is currently under Effi's Intuit account. `CLAUDE.md` lists transferring the Intuit developer
app to Yigal as an open item, and Intuit has no self-service transfer between developer accounts.
Two realistic routes, to be confirmed in the portal at the time:

- **Invite Yigal to the developer account** as a member, so ownership of the app follows the account.
- **Yigal creates his own production app** under his Intuit ID and we re-enter his client ID and
  secret on the card and re-run Connect. Slower, but it leaves nothing of Tidelane's production
  access attached to Effi.

Whichever route, the redirect URI to register is unchanged, and the connection must be re-made once:
a new app means a new client ID, and refresh tokens are not portable between apps.

## Troubleshooting

The card reports failures as `?quickbooks=error&reason=...`.

| `reason` | What it means |
|---|---|
| `not_configured` | client credentials or `CREDENTIALS_KEY` are missing |
| `access_denied` | you cancelled at the Intuit consent screen |
| `invalid_state` | the sign-in link was stale (over ten minutes) or already used; start again from the card |
| `missing_code` | Intuit did not return an authorization code |
| `token_exchange` | Intuit rejected the code exchange; check the client ID, secret and registered redirect URI |
| `forbidden` | only an admin can connect |
| `vendor_error` | Intuit reported an error |

The two failures worth suspecting first:

- **`token_exchange`** is almost always a redirect URI that does not match character for character,
  or a development client ID used with production keys' redirect URI. Compare against the string the
  card prints.
- **Test connection fails after a swap**: see step 6; you changed the keys without re-connecting.

## What never enters this repository

The client secret, the refresh token and the realm id. They live encrypted in D1, or as Wrangler
secrets. `GET /api/integrations` reports presence, source and the last four characters only; keep it
that way.
