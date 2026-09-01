# PureModX Firebase Functions

This folder is a starter backend specification for the device-verification system.

Architecture:
- GitHub Pages: public verification UI
- Firebase Cloud Functions: trusted verification API
- Firebase Realtime Database: verification state

Do not put URLKing API keys or Firebase service-account credentials in this repository.

## Required endpoints
- `POST /createSession`
- `GET /verify?sid=...&token=...`
- `POST /status`

## Data model
`verification/sessions/<sid>` contains a hash of the one-time token, the hashed installation ID, creation/expiry timestamps, and used state.

`verification/devices/<installationHash>` contains the current verification status and `verified_until` timestamp.
