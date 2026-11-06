# PureModX Device Verification

This repository contains the GitHub Pages verification website and Firebase Cloud Functions backend for the PureModX Android Java dialog.

## Website

GitHub Pages URL:
`https://puremodx.github.io/Verified-account/`

The Android app calls `startVerification`, opens the returned website URL, and polls `checkStatus`. The website sends the one-time `sid` and `token` to the `verify` Cloud Function. The function validates and consumes the token, then writes the device approval using the Firebase Admin SDK.

## Firebase project

- Project ID: `puremodx-89421`
- Realtime Database: `https://puremodx-89421-default-rtdb.firebaseio.com/`
- Functions region: `us-central1`
- Runtime: Node.js 20

## Exact Android client contract

Use one stable installation ID generated once and stored locally. Do not use a new random ID for each request.

1. `POST https://us-central1-puremodx-89421.cloudfunctions.net/startVerification`
   JSON: `{"installation_id":"<stable-installation-id>"}`
   Response: `{"ok":true,"session_id":"...","verification_url":"...","expires_at":...}`
2. Open the returned `verification_url` in the browser.
3. Poll `POST https://us-central1-puremodx-89421.cloudfunctions.net/checkStatus`
   JSON: `{"installation_id":"<same-stable-installation-id>"}`
   Response after approval: `{"ok":true,"verified":true,"expires_at":<unix-ms>}`
4. Unlock only when `ok == true`, `verified == true`, and `expires_at > System.currentTimeMillis()`.

The app must poll `checkStatus`, not the legacy `users/{deviceId}` path. A practical polling interval is 3–5 seconds, with a client-side maximum wait equal to the 15-minute session lifetime. The 12-hour access period begins when the website successfully verifies the device.

## Database paths

Cloud Functions own these paths:

- `verification/sessions/{sid}`
- `verification/devices/{sha256(installation_id)}`

Client rules deny direct reads and writes under `verification`. Cloud Functions use the Admin SDK and bypass client rules. Do not make these paths publicly writable.

## Deploy

Install Node.js 20 and Firebase CLI, authenticate, then run from the repository root:

```sh
firebase use puremodx-89421
cd functions
npm install
cd ..
firebase deploy --only functions,database
```

Enable GitHub Pages for the `main` branch and repository root. GitHub Pages publishes the website independently of Cloud Functions deployment.

## Important deployment note

Committing source code does not deploy Firebase Cloud Functions. After deployment, test the complete flow: app starts a session, browser verifies the one-time link, and app receives `verified: true` from `checkStatus`.

Never put Firebase service-account credentials in the website or Android APK. Only the trusted Cloud Functions should write approval state.
