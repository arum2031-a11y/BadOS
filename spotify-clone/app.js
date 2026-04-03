const AUTH_ENDPOINT = "https://accounts.spotify.com/authorize";
const TOKEN_ENDPOINT = "https://accounts.spotify.com/api/token";
const API_BASE = "https://api.spotify.com/v1";

const scopes = [
  "user-read-email",
  "user-read-private",
  "user-read-playback-state",
  "user-modify-playback-state",
];

const $ = (id) => document.getElementById(id);

const clientIdInput = $("clientId");
const redirectUriInput = $("redirectUri");
const authStatus = $("authStatus");
const trackInfo = $("trackInfo");
const resultsList = $("results");

let pollHandle = null;

function initializeDefaults() {
  redirectUriInput.value = localStorage.getItem("spotify_redirect_uri") || window.location.origin + window.location.pathname;
  clientIdInput.value = localStorage.getItem("spotify_client_id") || "";
}

function randomString(length = 64) {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let output = "";
  for (let i = 0; i < length; i += 1) {
    output += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return output;
}

async function sha256(plain) {
  const encoder = new TextEncoder();
  const data = encoder.encode(plain);
  return crypto.subtle.digest("SHA-256", data);
}

function base64urlencode(buffer) {
  return btoa(String.fromCharCode(...new Uint8Array(buffer)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

async function buildChallenge(verifier) {
  const digest = await sha256(verifier);
  return base64urlencode(digest);
}

function getAccessToken() {
  return localStorage.getItem("spotify_access_token");
}

function setAccessToken(token) {
  localStorage.setItem("spotify_access_token", token);
}

function clearSession() {
  [
    "spotify_access_token",
    "spotify_refresh_token",
    "spotify_code_verifier",
    "spotify_state",
  ].forEach((k) => localStorage.removeItem(k));
}

async function spotifyFetch(path, options = {}) {
  const token = getAccessToken();
  if (!token) {
    throw new Error("No access token. Please login.");
  }

  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });

  if (!response.ok) {
    const msg = await response.text();
    throw new Error(`Spotify API error (${response.status}): ${msg}`);
  }

  if (response.status === 204) {
    return null;
  }

  return response.json();
}

async function login() {
  const clientId = clientIdInput.value.trim();
  const redirectUri = redirectUriInput.value.trim();

  if (!clientId || !redirectUri) {
    authStatus.textContent = "Client ID and Redirect URI are required.";
    return;
  }

  localStorage.setItem("spotify_client_id", clientId);
  localStorage.setItem("spotify_redirect_uri", redirectUri);

  const state = randomString(16);
  const codeVerifier = randomString(96);
  const codeChallenge = await buildChallenge(codeVerifier);

  localStorage.setItem("spotify_state", state);
  localStorage.setItem("spotify_code_verifier", codeVerifier);

  const params = new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    scope: scopes.join(" "),
    redirect_uri: redirectUri,
    state,
    code_challenge_method: "S256",
    code_challenge: codeChallenge,
  });

  window.location.href = `${AUTH_ENDPOINT}?${params.toString()}`;
}

async function exchangeCodeForToken() {
  const url = new URL(window.location.href);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  if (!code) return;

  const savedState = localStorage.getItem("spotify_state");
  const verifier = localStorage.getItem("spotify_code_verifier");
  const clientId = localStorage.getItem("spotify_client_id");
  const redirectUri = localStorage.getItem("spotify_redirect_uri");

  if (!savedState || savedState !== state || !verifier || !clientId || !redirectUri) {
    authStatus.textContent = "OAuth state mismatch or missing login data. Please try again.";
    return;
  }

  const body = new URLSearchParams({
    client_id: clientId,
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri,
    code_verifier: verifier,
  });

  const response = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Token exchange failed: ${text}`);
  }

  const tokenData = await response.json();
  setAccessToken(tokenData.access_token);

  const cleanUrl = new URL(window.location.href);
  cleanUrl.search = "";
  window.history.replaceState({}, document.title, cleanUrl.toString());
}

async function refreshNowPlaying() {
  try {
    const data = await spotifyFetch("/me/player/currently-playing");

    if (!data || !data.item) {
      trackInfo.textContent = "Nothing is currently playing.";
      return;
    }

    const track = data.item;
    const artists = track.artists.map((a) => a.name).join(", ");
    trackInfo.innerHTML = `<strong>${track.name}</strong> — ${artists}<br/><small>Album: ${track.album.name}</small>`;
  } catch (error) {
    trackInfo.textContent = error.message;
  }
}

async function doPlayback(action) {
  try {
    await spotifyFetch(`/me/player/${action}`, { method: "POST" });
    setTimeout(refreshNowPlaying, 600);
  } catch (error) {
    authStatus.textContent = error.message;
  }
}

async function searchTracks() {
  const q = $("searchInput").value.trim();
  if (!q) return;

  resultsList.innerHTML = "<li>Searching...</li>";

  try {
    const data = await spotifyFetch(`/search?type=track&limit=10&q=${encodeURIComponent(q)}`);
    const items = data?.tracks?.items || [];

    if (!items.length) {
      resultsList.innerHTML = "<li>No results found.</li>";
      return;
    }

    resultsList.innerHTML = items
      .map((track) => {
        const artists = track.artists.map((a) => a.name).join(", ");
        return `<li><span><strong>${track.name}</strong> — ${artists}</span><a href="${track.external_urls.spotify}" target="_blank" rel="noopener noreferrer">Open</a></li>`;
      })
      .join("");
  } catch (error) {
    resultsList.innerHTML = `<li>${error.message}</li>`;
  }
}

function bindEvents() {
  $("loginBtn").addEventListener("click", login);
  $("logoutBtn").addEventListener("click", () => {
    clearSession();
    authStatus.textContent = "Logged out.";
    trackInfo.textContent = "No track loaded yet.";
    resultsList.innerHTML = "";
    if (pollHandle) clearInterval(pollHandle);
  });

  $("prevBtn").addEventListener("click", () => doPlayback("previous"));
  $("playPauseBtn").addEventListener("click", async () => {
    try {
      const state = await spotifyFetch("/me/player");
      const action = state?.is_playing ? "pause" : "play";
      await doPlayback(action);
    } catch (error) {
      authStatus.textContent = error.message;
    }
  });
  $("nextBtn").addEventListener("click", () => doPlayback("next"));

  $("searchBtn").addEventListener("click", searchTracks);
  $("searchInput").addEventListener("keydown", (e) => {
    if (e.key === "Enter") searchTracks();
  });
}

async function init() {
  initializeDefaults();
  bindEvents();

  try {
    await exchangeCodeForToken();
  } catch (error) {
    authStatus.textContent = error.message;
  }

  if (getAccessToken()) {
    authStatus.textContent = "Connected to Spotify.";
    await refreshNowPlaying();
    pollHandle = setInterval(refreshNowPlaying, 5000);
  }
}

init();
