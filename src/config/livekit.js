/**
 * LiveKit Configuration
 * Get your API keys from https://cloud.livekit.io
 */

// LiveKit Cloud URL (or your self-hosted server URL)
export const LIVEKIT_URL =
  import.meta.env.VITE_LIVEKIT_URL || "wss://your-project.livekit.cloud";

// Token endpoint (our server generates tokens)
export const LIVEKIT_TOKEN_ENDPOINT =
  import.meta.env.VITE_LIVEKIT_TOKEN_ENDPOINT ||
  (import.meta.env.VITE_WS_URL?.replace("ws://", "http://").replace(
    "wss://",
    "https://"
  ) || "http://localhost:3001") + "/livekit/token";

// Room name prefixes for different room types
export const ROOM_PREFIXES = {
  1: "video-room-", // Room 1: Video only
  2: "audio-room-", // Room 2: Audio only
};

// Get full room name
export function getRoomName(roomId) {
  return `${ROOM_PREFIXES[roomId] || "room-"}main`;
}
