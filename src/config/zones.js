/**
 * Room Configuration
 * Research prototype with 4 rooms: Video, Audio, Messages, Drawing
 */

export const ROOMS = {
  1: {
    id: 1,
    name: "Look",
    shortDesc: "See yourself and others.",
    description: "See yourself and know others are here. No talking.",
    rules:
      "Your camera is ON. Microphone is always OFF. You can see your own preview only.",
    permission: "camera",
    color: "room1",
    icon: "👀",
  },
  2: {
    id: 2,
    name: "Listen",
    shortDesc: "Microphone required, no video",
    description: "Listen and speak. No visuals.",
    rules: "Your microphone is ON. Camera is never used. No recordings stored.",
    permission: "microphone",
    color: "room2",
    icon: "👂",
  },
  3: {
    id: 3,
    name: "Talk",
    shortDesc: "Talk to others.",
    description: "Talk to others. No pressure to reply.",
    rules: "You can send text messages to others. No pressure to reply.",
    permission: null,
    color: "room3",
    icon: "💬",
  },
  4: {
    id: 4,
    name: "Draw",
    shortDesc: "Draw together.",
    description: "Draw or just watch. A shared canvas.",
    rules: "You can draw on a shared canvas. Watch or participate.",
    permission: null,
    color: "room4",
    icon: "🖌️",
  },
  5: {
    id: 5,
    name: "Move",
    shortDesc: "Ambient co-presence via motion.",
    description:
      "See subtle traces of others' cursor / touch positions in real time.",
    rules:
      "No names, no prompts. Just a gentle sense that others are here, moving.",
    permission: null,
    color: "room5",
    icon: "👋",
  },
  6: {
    id: 6,
    name: "Face",
    shortDesc: "Share face presence without video.",
    description:
      "Detect face landmarks locally and share only minimal line traces.",
    rules:
      "Your camera is used locally for landmark detection. No video is shared. No names.",
    permission: "camera",
    color: "room6",
    icon: "🙂",
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
