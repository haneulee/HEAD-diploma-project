# Research Prototype - Multi-Room Communication Study

A lightweight web application for remote research testing with **real-time video, audio, and messaging** via WebRTC. This experimental tool observes where users stay, leave, and interact under enforced communication constraints.

**This is NOT a social product and NOT a chat app.** It is a research tool that logs behavioral metadata without storing any personal content.

## Features

### 4 Rooms with Real-Time Communication

| Room  | Name       | Communication                           | What's Logged                                |
| ----- | ---------- | --------------------------------------- | -------------------------------------------- |
| **1** | Video Only | 📹 WebRTC video (see others), mic OFF   | Total time, camera-on duration               |
| **2** | Audio Only | 🎤 WebRTC audio (hear others), no video | Total time, mic-on duration, speaking events |
| **4** | Messages   | 💬 Real-time text messages              | Total time, messages count, avg length       |
| **6** | Drawing    | 🖌️ Shared canvas, pen/erase             | Total time, strokes count, drawing duration  |

### Key Features

- **WebRTC Peer-to-Peer**: See other participants in Room 1, hear them in Room 2
- **Real-time messaging**: Messages visible to all in Room 4
- **No content storage**: Video, audio, and messages are NOT recorded
- **Anonymous users**: Auto-generated participant IDs only
- **Permission gates**: Camera/mic permissions required before entering Rooms 1 & 2
- **Automatic data collection**: Session data POSTed to Google Apps Script
- **CSV/JSON export**: Download session summary locally

## Tech Stack

- **Frontend**: React 19 + Vite
- **Media**: WebRTC (peer-to-peer video/audio), `getUserMedia`
- **Real-time**: WebSocket (Node.js with `ws`) for signaling + messages
- **Data**: localStorage + Google Apps Script endpoint

## Quick Start

### 1. Install Dependencies

```bash
npm install
```

### 2. Start Both Server & Frontend

```bash
npm run dev:all
```

Or run them separately:

```bash
# Terminal 1: WebSocket server (port 3001)
npm run server

# Terminal 2: Frontend (port 5173)
npm run dev
```

### 3. Open in Browser

Open http://localhost:5173

For multi-user testing, open in multiple browser tabs or different devices on the same network.

## Configuration

### Environment Variables

Create a `.env` file in the project root:

```env
# WebSocket server URL (defaults to ws://localhost:3001)
VITE_WS_URL=ws://localhost:3001

# Google Apps Script endpoint for data collection
VITE_DATA_ENDPOINT=https://script.google.com/macros/s/YOUR_SCRIPT_ID/exec
```

### Google Apps Script Setup

1. Create a new Google Sheet
2. Go to **Extensions → Apps Script**
3. Replace the code with:

```javascript
function doPost(e) {
  try {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
    const data = JSON.parse(e.postData.contents);

    // Add headers if first row is empty
    if (sheet.getLastRow() === 0) {
      const headers = Object.keys(data);
      sheet.appendRow(headers);
    }

    // Add data row
    const values = Object.values(data);
    sheet.appendRow(values);

    return ContentService.createTextOutput(
      JSON.stringify({ success: true })
    ).setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(
      JSON.stringify({ error: err.message })
    ).setMimeType(ContentService.MimeType.JSON);
  }
}
```

4. Click **Deploy → New deployment**
5. Select **Web app**
6. Set:
   - Execute as: **Me**
   - Who has access: **Anyone**
7. Click **Deploy** and copy the URL
8. Paste the URL in your `.env` file as `VITE_DATA_ENDPOINT`

## Data Schema

### Session Data (CSV columns)

| Field                | Type   | Description                                    |
| -------------------- | ------ | ---------------------------------------------- |
| `participantId`      | string | Auto-generated anonymous ID (e.g., P-ABC12345) |
| `firstRoom`          | number | First room entered (1, 2, 4, or 6)             |
| `totalTimeMs`        | number | Total session duration in milliseconds         |
| `switchesCount`      | number | Number of room changes                         |
| `timeVideoOnlyMs`    | number | Time spent in Room 1                           |
| `timeAudioOnlyMs`    | number | Time spent in Room 2                           |
| `timeMessagesOnlyMs` | number | Time spent in Room 4                           |
| `timeDrawingMs`      | number | Time spent in Room 6                           |
| `cameraOnMs`         | number | Camera-on duration (Room 1)                    |
| `micOnMs`            | number | Mic-on duration (Room 2)                       |
| `speakingEvents`     | number | Number of speaking occurrences (Room 2)        |
| `speakingMs`         | number | Total speaking duration (Room 2)               |
| `messagesSent`       | number | Messages sent (Room 4)                         |
| `avgMessageLength`   | number | Average message length (Room 4)                |
| `strokesCount`       | number | Drawing strokes (Room 6)                       |
| `roomSequence`       | string | Path through rooms (e.g., "1 → 4 → 6 → 2")     |

## Project Structure

```
├── server/
│   └── index.js              # WebSocket server (signaling + messages)
├── src/
│   ├── components/
│   │   ├── FinishView.jsx      # Session summary
│   │   ├── Lobby.jsx           # Room selection
│   │   ├── Room1VideoOnly.jsx  # WebRTC video room
│   │   ├── Room2AudioOnly.jsx  # WebRTC audio room
│   │   ├── Room4Messages.jsx   # Real-time messaging
│   │   ├── Room6Drawing.jsx    # Shared canvas
│   │   ├── ZoneSwitcher.jsx    # Room change modal
│   │   └── ZoneView.jsx        # Room container
│   ├── config/
│   │   ├── api.js              # WebSocket & endpoint config
│   │   └── zones.js            # Room definitions
│   ├── hooks/
│   │   ├── useSession.js       # Session & metrics tracking
│   │   ├── useWebSocket.js     # WebSocket + signaling
│   │   └── useWebRTC.js        # WebRTC peer connections
│   ├── App.jsx
│   ├── App.css
│   ├── index.css
│   └── main.jsx
├── package.json
└── vite.config.js
```

## WebRTC Architecture

```
┌─────────────┐    WebSocket     ┌─────────────┐
│   User A    │ ◄──────────────► │   Server    │
│  (Browser)  │    Signaling     │  (Node.js)  │
└─────────────┘                  └─────────────┘
       │                                │
       │         WebRTC P2P             │
       │      (Video/Audio/Data)        │
       ▼                                ▼
┌─────────────┐    WebSocket     ┌─────────────┐
│   User B    │ ◄──────────────► │   Server    │
│  (Browser)  │    Signaling     │  (Node.js)  │
└─────────────┘                  └─────────────┘
```

- **Signaling**: WebSocket server relays offer/answer/ICE candidates
- **Media**: Direct peer-to-peer connection (no media through server)
- **Messages**: Room 4 messages go through WebSocket (not P2P)
- **Drawing**: Room 6 strokes go through WebSocket

## Production Deployment

### Step 1: Deploy WebSocket Server (Railway - 무료)

WebSocket 서버를 먼저 배포해야 합니다.

1. [Railway](https://railway.app)에 GitHub 로그인
2. **New Project → Deploy from GitHub repo**
3. 이 저장소 선택
4. **Settings**에서:
   - **Root Directory**: `server`
   - **Start Command**: `node index.js`
5. **Variables**에서:
   - `PORT`: Railway가 자동 설정
6. **Deploy** 클릭
7. 생성된 URL 복사 (예: `your-app.railway.app`)

### Step 2: Deploy Frontend (Vercel)

1. [Vercel](https://vercel.com)에 GitHub 로그인
2. **Import Project** → 이 저장소 선택
3. **Environment Variables** 설정:

```
VITE_WS_URL=wss://your-app.railway.app
VITE_DATA_ENDPOINT=https://script.google.com/macros/s/YOUR_SCRIPT_ID/exec
```

4. **Deploy** 클릭

### 중요: HTTPS 필수

- WebRTC와 카메라/마이크 접근은 HTTPS에서만 작동
- Vercel: 자동으로 HTTPS 제공
- Railway: 자동으로 HTTPS 제공 (wss:// 사용)

### 환경 변수 요약

| 변수 | 설명 | 예시 |
|------|------|------|
| `VITE_WS_URL` | WebSocket 서버 URL | `wss://your-app.railway.app` |
| `VITE_DATA_ENDPOINT` | Google Apps Script URL | `https://script.google.com/...` |

## Privacy & Ethics

This tool is designed for ethical research:

- ❌ No video/audio recording
- ❌ No message content storage
- ❌ No IP addresses or device fingerprints
- ❌ No authentication or personal identifiers
- ✅ Only behavioral metadata (time, counts, sequences)
- ✅ Anonymous participant IDs
- ✅ Users can export their own data
- ✅ Clear rules displayed before entering each room

## Troubleshooting

### WebRTC Connection Issues

- Ensure both users have allowed camera/mic permissions
- Check if firewall is blocking WebRTC (STUN servers need access)
- Try on same network first, then test across networks

### WebSocket Connection Failed

- Verify server is running: `npm run server`
- Check browser console for connection errors
- Ensure `VITE_WS_URL` matches server address

### Google Apps Script Not Receiving Data

- Verify deployment is set to "Anyone" access
- Check that URL is correct in `.env`
- Look at Apps Script execution logs for errors

## License

MIT - Use responsibly for research purposes only.
