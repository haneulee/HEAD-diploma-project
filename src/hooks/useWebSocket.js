/**
 * WebSocket Connection Hook
 * Manages connection to the research server
 * Includes WebRTC signaling support
 */

import { useCallback, useEffect, useRef, useState } from "react";

import { WS_URL } from "../config/api";

const RECONNECT_DELAY = 3000;
const PING_INTERVAL = 30000;

export function useWebSocket(participantId) {
  const [isConnected, setIsConnected] = useState(false);
  const [presenceCounts, setPresenceCounts] = useState({
    1: 0,
    2: 0,
    4: 0,
    6: 0,
  });
  const [roomUsers, setRoomUsers] = useState([]);
  const [incomingMessages, setIncomingMessages] = useState([]);
  const [drawingStrokes, setDrawingStrokes] = useState([]);

  const wsRef = useRef(null);
  const currentRoomRef = useRef(null);
  const reconnectTimeoutRef = useRef(null);
  const pingIntervalRef = useRef(null);
  const handlersRef = useRef({});
  const participantIdRef = useRef(participantId);
  const connectRef = useRef(null);

  // Keep participantId ref updated via effect
  useEffect(() => {
    participantIdRef.current = participantId;
  }, [participantId]);

  // Handle incoming messages
  const handleMessage = useCallback((data) => {
    switch (data.type) {
      case "presence":
        setPresenceCounts(data.counts);
        break;

      case "room_users":
        setRoomUsers(data.users);
        // Notify RTC handler about existing users to connect to
        if (handlersRef.current.onRoomUsers) {
          handlersRef.current.onRoomUsers(data.users);
        }
        break;

      case "user_joined":
        setRoomUsers((prev) => {
          if (prev.includes(data.participantId)) return prev;
          return [...prev, data.participantId];
        });
        // Notify RTC handler about new user
        if (handlersRef.current.onUserJoined) {
          handlersRef.current.onUserJoined(data.participantId);
        }
        break;

      case "user_left":
        // Only filter if user is actually in the list
        setRoomUsers((prev) => {
          if (prev.includes(data.participantId)) {
            return prev.filter((id) => id !== data.participantId);
          }
          return prev;
        });
        // Notify RTC handler about user leaving with a small delay
        // to avoid premature removal during WebRTC setup
        if (handlersRef.current.onUserLeft) {
          setTimeout(() => {
            if (handlersRef.current.onUserLeft) {
              handlersRef.current.onUserLeft(data.participantId);
            }
          }, 100);
        }
        break;

      // WebRTC signaling
      case "rtc_offer":
        if (handlersRef.current.onRtcOffer) {
          handlersRef.current.onRtcOffer(data.fromId, data.offer);
        }
        break;

      case "rtc_answer":
        if (handlersRef.current.onRtcAnswer) {
          handlersRef.current.onRtcAnswer(data.fromId, data.answer);
        }
        break;

      case "rtc_ice_candidate":
        if (handlersRef.current.onRtcIceCandidate) {
          handlersRef.current.onRtcIceCandidate(data.fromId, data.candidate);
        }
        break;

      // Room 3: Text messages with content
      case "message":
        setIncomingMessages((prev) => [
          ...prev,
          {
            id: data.messageId,
            text: data.text,
            sender: data.participantId,
            isYou: false,
            timestamp: data.timestamp,
          },
        ]);
        break;

      case "draw_stroke":
        setDrawingStrokes((prev) => [...prev, data.stroke]);
        break;

      case "drawing_history":
        setDrawingStrokes(data.strokes);
        break;

      case "clear_drawing":
        setDrawingStrokes([]);
        break;

      case "pong":
        // Ping response - connection is alive
        break;

      default:
        break;
    }
  }, []);

  // Connect to WebSocket
  useEffect(() => {
    const connect = () => {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        return;
      }

      try {
        const ws = new WebSocket(WS_URL);

        ws.onopen = () => {
          console.log("[WS] Connected");
          setIsConnected(true);

          // Start ping interval
          pingIntervalRef.current = setInterval(() => {
            if (ws.readyState === WebSocket.OPEN) {
              ws.send(JSON.stringify({ type: "ping" }));
            }
          }, PING_INTERVAL);

          // Rejoin room if we were in one
          if (currentRoomRef.current !== null) {
            ws.send(
              JSON.stringify({
                type: "join",
                roomId: currentRoomRef.current,
                participantId: participantIdRef.current,
              })
            );
          }
        };

        ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            handleMessage(data);
          } catch (err) {
            console.error("[WS] Parse error:", err);
          }
        };

        ws.onclose = () => {
          console.log("[WS] Disconnected");
          setIsConnected(false);

          if (pingIntervalRef.current) {
            clearInterval(pingIntervalRef.current);
          }

          // Reconnect using the stored reference
          reconnectTimeoutRef.current = setTimeout(() => {
            if (connectRef.current) {
              connectRef.current();
            }
          }, RECONNECT_DELAY);
        };

        ws.onerror = (err) => {
          console.error("[WS] Error:", err);
        };

        wsRef.current = ws;
      } catch (err) {
        console.error("[WS] Connection error:", err);
        reconnectTimeoutRef.current = setTimeout(() => {
          if (connectRef.current) {
            connectRef.current();
          }
        }, RECONNECT_DELAY);
      }
    };

    // Store connect function in ref for reconnection
    connectRef.current = connect;

    // Initial connection
    connect();

    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (pingIntervalRef.current) {
        clearInterval(pingIntervalRef.current);
      }
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [handleMessage]);

  // Join a room
  const joinRoom = useCallback((roomId) => {
    // Only clear room data if actually changing rooms
    const isChangingRoom = currentRoomRef.current !== roomId;
    currentRoomRef.current = roomId;

    if (isChangingRoom) {
      setIncomingMessages([]);
      setDrawingStrokes([]);
      setRoomUsers([]);
    }

    if (wsRef.current?.readyState === WebSocket.OPEN) {
      console.log(`[WS] Joining room ${roomId}`);
      wsRef.current.send(
        JSON.stringify({
          type: "join",
          roomId,
          participantId: participantIdRef.current,
        })
      );
    }
  }, []);

  // Leave current room
  const leaveRoom = useCallback(() => {
    currentRoomRef.current = null;
    setRoomUsers([]);
    setIncomingMessages([]);

    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: "leave" }));
    }
  }, []);

  // Send a text message (Room 3) - now includes text content
  const sendMessage = useCallback((messageId, text) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(
        JSON.stringify({
          type: "message",
          messageId,
          text,
        })
      );
    }
  }, []);

  // Send WebRTC signaling message
  const sendRtcSignal = useCallback((signalData) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(signalData));
    }
  }, []);

  // Send a drawing stroke (Room 4)
  const sendStroke = useCallback((strokeData) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(
        JSON.stringify({
          type: "draw_stroke",
          ...strokeData,
        })
      );
    }
  }, []);

  // Clear drawing (Room 4)
  const clearDrawing = useCallback(() => {
    setDrawingStrokes([]);
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: "clear_drawing" }));
    }
  }, []);

  // Register event handlers
  const registerHandlers = useCallback((handlers) => {
    handlersRef.current = { ...handlersRef.current, ...handlers };
  }, []);

  // Clear incoming messages
  const clearMessages = useCallback(() => {
    setIncomingMessages([]);
  }, []);

  // Get presence count for a specific room
  const getPresenceCount = useCallback(
    (roomId) => {
      return presenceCounts[roomId] || 0;
    },
    [presenceCounts]
  );

  return {
    isConnected,
    presenceCounts,
    roomUsers,
    incomingMessages,
    drawingStrokes,
    joinRoom,
    leaveRoom,
    sendMessage,
    sendRtcSignal,
    sendStroke,
    clearDrawing,
    clearMessages,
    registerHandlers,
    getPresenceCount,
  };
}
