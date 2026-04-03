# Spotify Clone (HTML/CSS/JS)

This mini app gives you a Spotify-like UI and connects to **your own real Spotify account** using Spotify's official OAuth (PKCE) flow.

## Setup

1. Create a Spotify app in the Spotify Developer Dashboard.
2. Copy your **Client ID**.
3. Add a Redirect URI in your Spotify app settings (for local testing, `http://127.0.0.1:5500/spotify-clone/` is common).
4. Serve this repository with any static file server, then open `spotify-clone/index.html`.
5. Paste your Client ID + Redirect URI into the page and click **Login with Spotify**.

## Notes

- Playback controls (`prev/play/pause/next`) require Spotify Premium and an active playback device.
- Tokens are stored in browser localStorage for demo convenience.
- Never expose a Spotify Client Secret in frontend code.
