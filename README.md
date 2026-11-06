# PureModX Device Verification

This repository hosts the GitHub Pages verification screen for the PureModX Android verification dialog.

## Frontend

GitHub Pages URL:

`https://puremodx.github.io/Verified-account/`

The page reads the one-time `sid` and `token` query parameters and calls the Firebase HTTPS function:

`GET https://us-central1-puremodx-89421.cloudfunctions.net/verify?sid=...&token=...`

The website does not write to Realtime Database directly. The trusted Cloud Function validates the one-time token, marks the session as used, and writes the verified device record.

## Firebase project

- Project ID: `puremodx-89421`
- Realtime Database: `https://puremodx-89421-default-rtdb.firebaseio.com/`
- Functions region: `us-central1`
- Functions runtime: Node.js 20

## Android client contract

The Android app must use the same stable installation ID for both calls:

1. `POST /startVerification` with JSON `{"installation_id":"<stable-installation-id>"}`
   - Response contains `session_id`, `verification_url`, and `expires_at`.
   - Open `verification_url` in the browser.
2. Poll `POST /checkStatus` with the same JSON `{"installation_id":"<same-stable-installation-id>"}`.
   - Response is `{"ok":true,"verified":true,"expires_at":<unix-ms>}` after approval.
3. Unlock the app only when `verified === true` and the returned expiry is still in the future.

Do not poll the old `users/{deviceId}` path for this flow. The Cloud Functions use these server-owned paths:

- `verification/sessions/{sid}`
- `verification/devices/{sha256(installation_id)}`

Realtime Database rules deny direct client reads and writes under `verification`; Admin SDK calls from Cloud Functions bypass those client rules.

## Deploy

From the repository root, after authenticating with the Firebase CLI and selecting project `puremodx-89421`:

```sh
firebase use puremodx-89421
firebase deploy --only functions,database
```

Enable GitHub Pages for the `main` branch and repository root if it is not already enabled. A GitHub Pages commit can take a few minutes to publish.

## Security notes

- Never put Firebase service-account credentials or private API secrets in `index.html`.
- The verification token is a one-time bearer secret. Do not share the full verification URL.
- Only the Cloud Function should write approval state.
- The Android app must not treat opening the browser or seeing a success-looking page as approval; it must confirm through `checkStatus`.
