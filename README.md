# IPTV Player

A web-based IPTV player with Live TV, EPG, Movies (VOD), and Series support.

## Features

- **Live TV** — Channel list with category grouping and search
- **TV Guide (EPG)** — 24h interactive grid guide
- **VOD** — Movies and Series with metadata, posters, and episode lists
- **Favorites** — Unified favorites for channels, movies, and series
- **Auth** — User login with admin and viewer roles; OIDC/SSO support
- **Transcoding** — Hardware-accelerated (NVENC, AMF, QuickSync, VAAPI) with smart auto-detect
- **Playlist support** — Xtream Codes and M3U sources

## Getting Started

### Prerequisites

- Node.js v18+
- npm

### Install & Run

```bash
npm install
npm run dev
```

Open `http://localhost:3000` in your browser.

### Docker

```yaml
services:
  iptv:
    build: .
    ports:
      - "3000:3000"
    volumes:
      - ./data:/app/data
    restart: unless-stopped
```

```bash
docker-compose up -d
```

## Configuration

### OIDC / SSO

Set these in your `.env` or Docker environment:

```env
OIDC_ISSUER_URL=https://your-idp.com/application/o/your-app/
OIDC_CLIENT_ID=your_client_id
OIDC_CLIENT_SECRET=your_client_secret
OIDC_CALLBACK_URL=http://localhost:3000/api/auth/oidc/callback
```

New SSO users are assigned the **Viewer** role by default.

### Hardware Transcoding

**Intel/AMD (VAAPI/QSV):**
```yaml
devices:
  - /dev/dri:/dev/dri
```

**NVIDIA (NVENC)** — requires [NVIDIA Container Toolkit](https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/install-guide.html):
```yaml
deploy:
  resources:
    reservations:
      devices:
        - driver: nvidia
          count: 1
          capabilities: [gpu, utility, video, compute]
```

## Usage

1. Go to **Settings → Content Sources**
2. Add your IPTV provider (Xtream Codes or M3U URL)
3. Click **Refresh Sources**
4. Browse **Live TV**, **Movies**, or **Series**

## Codec Support

| Codec | Chrome | Firefox | Safari | Edge |
|-------|--------|---------|--------|------|
| H.264 | ✅ | ✅ | ✅ | ✅ |
| H.265 | Auto-Transcode | Auto-Transcode | ✅ | ⚠️ |
| AV1 | ✅ | ✅ | Auto-Transcode | ✅ |
| AAC | ✅ | ✅ | ✅ | ✅ |
| AC3/EAC3 | Auto-Transcode | Auto-Transcode | ✅ | Auto-Transcode |

## Stack

- **Backend**: Node.js, Express, SQLite
- **Frontend**: Vanilla JS, CSS3
- **Streaming**: HLS.js
- **Transcoding**: FFmpeg

## License

GPL-3.0 — see [LICENSE](LICENSE).
