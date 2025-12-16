/**
 * Room Configuration
 * Research prototype with 4 rooms: Video, Audio, Messages, Drawing
 */

export const ROOMS = {
  1: {
    id: 1,
    name: "Video Only",
    shortDesc: "Camera required, no audio",
    description: "See yourself and know others are here. No talking.",
    rules:
      "Your camera is ON. Microphone is always OFF. You can see your own preview only.",
    permission: "camera",
    color: "room1",
    icon: "📹",
  },
  2: {
    id: 2,
    name: "Audio Only",
    shortDesc: "Microphone required, no video",
    description: "Listen and speak. No visuals.",
    rules: "Your microphone is ON. Camera is never used. No recordings stored.",
    permission: "microphone",
    color: "room2",
    icon: "🎤",
  },
  4: {
    id: 4,
    name: "Messages Only",
    shortDesc: "Text only, no media",
    description: "Type if you want. No pressure to reply.",
    rules:
      "Text input only. No emojis. Replies are OPTIONAL. Message content is NOT stored.",
    permission: null,
    color: "room4",
    icon: "💬",
  },
  6: {
    id: 6,
    name: "Shared Drawing",
    shortDesc: "Draw together, no media",
    description: "Draw or just watch. A shared canvas.",
    rules:
      "Simple pen and erase. Watch or participate. Strokes sync in real-time.",
    permission: null,
    color: "room6",
    icon: "🖌️",
  },
};

// Get room by ID
export function getRoom(id) {
  return ROOMS[id] || null;
}

// Get all room IDs
export function getRoomIds() {
  return Object.keys(ROOMS).map(Number);
}

// Check if room requires permission
export function roomRequiresPermission(roomId) {
  const room = ROOMS[roomId];
  return room ? room.permission : null;
}
