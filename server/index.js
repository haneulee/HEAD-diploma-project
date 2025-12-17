/**
 * WebSocket Server for Research Prototype
 * Handles: presence, WebRTC signaling, messages, drawing sync
 *
 * Run: node server/index.js
 * Default port: 3001
 */

/* global process */

import { WebSocketServer } from "ws";
import { createServer } from "http";

const PORT = process.env.PORT || 3001;

// Create HTTP server
const server = createServer((req, res) => {
  // CORS headers for health check
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Content-Type", "application/json");

  if (req.url === "/health") {
    res.writeHead(200);
    res.end(JSON.stringify({ status: "ok", rooms: getRoomCounts() }));
  } else {
    res.writeHead(404);
    res.end(JSON.stringify({ error: "Not found" }));
  }
});

// Create WebSocket server
const wss = new WebSocketServer({ server });

// Room state
const rooms = {
  1: new Map(), // participantId -> { ws, joinedAt }
  2: new Map(),
  3: new Map(),
  4: new Map(),
};

// Drawing history for Room 4 (keep last N strokes for new joiners)
const MAX_DRAWING_HISTORY = 100;
let drawingHistory = [];

// Get room presence counts
function getRoomCounts() {
  return {
    1: rooms[1].size,
    2: rooms[2].size,
    3: rooms[3].size,
    4: rooms[4].size,
  };
}

// Broadcast to all clients in a specific room
function broadcastToRoom(roomId, message, excludeWs = null) {
  const room = rooms[roomId];
  if (!room) return;

  const data = JSON.stringify(message);
  room.forEach(({ ws }) => {
    if (ws !== excludeWs && ws.readyState === 1) {
      ws.send(data);
    }
  });
}

// Send to a specific participant in a room
function sendToParticipant(roomId, targetParticipantId, message) {
  const room = rooms[roomId];
  if (!room) return false;

  const target = room.get(targetParticipantId);
  if (target && target.ws.readyState === 1) {
    target.ws.send(JSON.stringify(message));
    return true;
  }
  return false;
}

// Broadcast presence counts to all connected clients
function broadcastPresence() {
  const counts = getRoomCounts();
  const message = JSON.stringify({ type: "presence", counts });

  wss.clients.forEach((client) => {
    if (client.readyState === 1) {
      client.send(message);
    }
  });
}

// Handle client connection
wss.on("connection", (ws) => {
  let participantId = null;
  let currentRoom = null;

  console.log("[WS] Client connected");

  // Send initial presence counts
  ws.send(JSON.stringify({ type: "presence", counts: getRoomCounts() }));

  ws.on("message", (data) => {
    try {
      const message = JSON.parse(data.toString());

      switch (message.type) {
        case "join": {
          participantId = message.participantId;
          const roomId = message.roomId;

          // Leave previous room only if actually changing rooms
          if (
            currentRoom !== null &&
            currentRoom !== roomId &&
            rooms[currentRoom]
          ) {
            // Only send user_left if user was actually in the previous room
            if (rooms[currentRoom].has(participantId)) {
              rooms[currentRoom].delete(participantId);
              broadcastToRoom(currentRoom, {
                type: "user_left",
                participantId,
                roomId: currentRoom,
              });
            }
          }

          // Join new room
          if (rooms[roomId]) {
            const wasAlreadyInRoom =
              currentRoom === roomId && rooms[roomId].has(participantId);
            currentRoom = roomId;
            rooms[roomId].set(participantId, { ws, joinedAt: Date.now() });

            // Only notify others if this is a new join (not a rejoin)
            if (!wasAlreadyInRoom) {
              // Notify others in room (they should initiate WebRTC connection)
              broadcastToRoom(
                roomId,
                {
                  type: "user_joined",
                  participantId,
                  roomId,
                },
                ws
              );
            }

            // Send room users to joiner (joiner will initiate connections to existing users)
            const usersInRoom = Array.from(rooms[roomId].keys()).filter(
              (id) => id !== participantId
            );
            ws.send(
              JSON.stringify({
                type: "room_users",
                roomId,
                users: usersInRoom,
              })
            );

            // If joining drawing room, send recent history
            if (roomId === 4 && drawingHistory.length > 0) {
              ws.send(
                JSON.stringify({
                  type: "drawing_history",
                  strokes: drawingHistory,
                })
              );
            }

            console.log(
              `[WS] ${participantId} joined room ${roomId} (${rooms[roomId].size} users)`
            );
          }

          broadcastPresence();
          break;
        }

        case "leave": {
          if (currentRoom !== null && rooms[currentRoom] && participantId) {
            rooms[currentRoom].delete(participantId);
            broadcastToRoom(currentRoom, {
              type: "user_left",
              participantId,
              roomId: currentRoom,
            });
            currentRoom = null;
            broadcastPresence();
            console.log(`[WS] ${participantId} left room`);
          }
          break;
        }

        // ==================== WebRTC Signaling ====================

        case "rtc_offer": {
          // Forward WebRTC offer to target peer
          if (currentRoom !== null && participantId && message.targetId) {
            const sent = sendToParticipant(currentRoom, message.targetId, {
              type: "rtc_offer",
              fromId: participantId,
              offer: message.offer,
            });
            if (sent) {
              console.log(
                `[RTC] Offer: ${participantId} -> ${message.targetId}`
              );
            }
          }
          break;
        }

        case "rtc_answer": {
          // Forward WebRTC answer to target peer
          if (currentRoom !== null && participantId && message.targetId) {
            const sent = sendToParticipant(currentRoom, message.targetId, {
              type: "rtc_answer",
              fromId: participantId,
              answer: message.answer,
            });
            if (sent) {
              console.log(
                `[RTC] Answer: ${participantId} -> ${message.targetId}`
              );
            }
          }
          break;
        }

        case "rtc_ice_candidate": {
          // Forward ICE candidate to target peer
          if (currentRoom !== null && participantId && message.targetId) {
            sendToParticipant(currentRoom, message.targetId, {
              type: "rtc_ice_candidate",
              fromId: participantId,
              candidate: message.candidate,
            });
          }
          break;
        }

        // ==================== Room 3: Messages (Talk) ====================

        case "message": {
          // Room 3: Text messages - broadcast to all in room
          if (currentRoom === 3 && participantId) {
            broadcastToRoom(
              3,
              {
                type: "message",
                participantId,
                messageId: message.messageId,
                text: message.text, // Now we send the actual text
                timestamp: Date.now(),
              },
              ws // Exclude sender (they already have it locally)
            );
            console.log(
              `[MSG] ${participantId}: ${message.text?.length} chars`
            );
          }
          break;
        }

        // ==================== Room 4: Drawing (Draw) ====================

        case "draw_stroke": {
          // Room 4: Drawing strokes
          if (currentRoom === 4 && participantId) {
            const stroke = {
              id: message.strokeId,
              participantId,
              points: message.points,
              color: message.color || "#ffffff",
              width: message.width || 2,
              tool: message.tool || "pen",
              timestamp: Date.now(),
            };

            // Add to history
            drawingHistory.push(stroke);
            if (drawingHistory.length > MAX_DRAWING_HISTORY) {
              drawingHistory = drawingHistory.slice(-MAX_DRAWING_HISTORY);
            }

            // Broadcast to everyone (including sender, for sync)
            broadcastToRoom(
              4,
              {
                type: "draw_stroke",
                stroke,
              },
              null // Include sender so their strokes are in drawingStrokes
            );
          }
          break;
        }

        case "clear_drawing": {
          // Room 4: Clear canvas
          if (currentRoom === 4) {
            drawingHistory = [];
            broadcastToRoom(4, {
              type: "clear_drawing",
              participantId,
            });
          }
          break;
        }

        case "ping": {
          ws.send(JSON.stringify({ type: "pong" }));
          break;
        }

        default:
          console.log("[WS] Unknown message type:", message.type);
      }
    } catch (err) {
      console.error("[WS] Error parsing message:", err);
    }
  });

  ws.on("close", () => {
    if (currentRoom !== null && rooms[currentRoom] && participantId) {
      rooms[currentRoom].delete(participantId);
      broadcastToRoom(currentRoom, {
        type: "user_left",
        participantId,
        roomId: currentRoom,
      });
      broadcastPresence();
    }
    console.log("[WS] Client disconnected:", participantId || "unknown");
  });

  ws.on("error", (err) => {
    console.error("[WS] Error:", err);
  });
});

// Start server (0.0.0.0 for cloud deployment)
server.listen(PORT, "0.0.0.0", () => {
  console.log(`\n🔬 Research Prototype Server`);
  console.log(`   WebSocket: ws://0.0.0.0:${PORT}`);
  console.log(`   Health: http://0.0.0.0:${PORT}/health\n`);
});
