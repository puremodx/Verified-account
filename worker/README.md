# PureModX verification backend

This directory is a Cloudflare Worker backend design for the GitHub Pages verification site.

Deploy this worker separately on Cloudflare Workers. Keep the URLKing API key as a Worker secret, not in GitHub.

Required environment bindings:
- `FIREBASE_DB_URL`: https://puremodx-89421-default-rtdb.firebaseio.com
- `URLKING_API_KEY`: your rotated URLKing API key (Worker secret)
- `URLKING_API_ENDPOINT`: the exact URLKing API endpoint from your account documentation

The Worker should expose:
- `POST /start` — accepts installation_id, creates a one-time verification session, and creates/returns a short URL.
- `GET /verify?sid=...&token=...` — validates the one-time session and writes a 12-hour `verified_until` value to Firebase.
- `POST /status` — checks whether the installation is still valid.

Do not commit service-account JSON, private keys, or API secrets to this repository.
