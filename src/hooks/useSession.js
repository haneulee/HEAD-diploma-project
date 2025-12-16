/**
 * Session Management Hook
 * Tracks participant data, room visits, and metrics per room
 * Handles data persistence and export
 */

import { AUTO_SAVE_INTERVAL, DATA_ENDPOINT } from "../config/api";
import { useCallback, useEffect, useRef, useState } from "react";

const STORAGE_KEY = "research_session_v2";

// Generate anonymous participant ID
function generateParticipantId() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let id = "";
  for (let i = 0; i < 8; i++) {
    id += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return `P-${id}`;
}

// Initial session state
function createInitialSession() {
  return {
    participantId: generateParticipantId(),
    sessionStart: new Date().toISOString(),
    sessionEnd: null,
    firstRoom: null,
    currentRoom: null,

    // Room visit history
    roomVisits: [], // [{roomId, enterAt, leaveAt, durationMs}]

    // Per-room metrics
    metrics: {
      room1: {
        totalTimeMs: 0,
        cameraOnMs: 0,
        visits: 0,
      },
      room2: {
        totalTimeMs: 0,
        micOnMs: 0,
        speakingEvents: 0,
        speakingMs: 0,
        visits: 0,
      },
      room4: {
        totalTimeMs: 0,
        messagesSent: 0,
        totalMessageLength: 0,
        lastMessageAt: null,
        idleTimeMs: 0,
        visits: 0,
      },
      room6: {
        totalTimeMs: 0,
        strokesCount: 0,
        drawingMs: 0,
        visits: 0,
      },
    },

    // Session summary
    switchesCount: 0,
    totalTimeMs: 0,
    completed: false,
    dataPosted: false,
  };
}

export function useSession() {
  const [session, setSession] = useState(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (!parsed.completed) {
          return parsed;
        }
      }
    } catch (e) {
      console.error("Failed to load session:", e);
    }
    return createInitialSession();
  });

  const currentRoomStartRef = useRef(null);
  const currentVisitIndexRef = useRef(-1);
  const autoSaveIntervalRef = useRef(null);

  // Save to localStorage
  const saveSession = useCallback((sessionData) => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(sessionData));
    } catch (e) {
      console.error("Failed to save session:", e);
    }
  }, []);

  // Save on every change
  useEffect(() => {
    saveSession(session);
  }, [session, saveSession]);

  // Auto-save to endpoint periodically
  useEffect(() => {
    if (AUTO_SAVE_INTERVAL > 0 && !session.completed) {
      autoSaveIntervalRef.current = setInterval(() => {
        postSessionData(session, false);
      }, AUTO_SAVE_INTERVAL);

      return () => {
        if (autoSaveIntervalRef.current) {
          clearInterval(autoSaveIntervalRef.current);
        }
      };
    }
  }, [session]);

  // Enter a room
  const enterRoom = useCallback((roomId) => {
    const now = new Date().toISOString();
    currentRoomStartRef.current = Date.now();

    setSession((prev) => {
      const isFirstRoom = prev.firstRoom === null;
      const isSwitching =
        prev.currentRoom !== null && prev.currentRoom !== roomId;

      // Close previous visit if any
      let updatedVisits = [...prev.roomVisits];
      if (
        currentVisitIndexRef.current >= 0 &&
        updatedVisits[currentVisitIndexRef.current]
      ) {
        const visit = updatedVisits[currentVisitIndexRef.current];
        if (!visit.leaveAt) {
          const enterTime = new Date(visit.enterAt).getTime();
          updatedVisits[currentVisitIndexRef.current] = {
            ...visit,
            leaveAt: now,
            durationMs: Date.now() - enterTime,
          };
        }
      }

      // Add new visit
      const newVisitIndex = updatedVisits.length;
      updatedVisits.push({
        roomId,
        enterAt: now,
        leaveAt: null,
        durationMs: 0,
      });
      currentVisitIndexRef.current = newVisitIndex;

      // Update room visit count
      const roomKey = `room${roomId}`;
      const updatedMetrics = {
        ...prev.metrics,
        [roomKey]: {
          ...prev.metrics[roomKey],
          visits: prev.metrics[roomKey].visits + 1,
        },
      };

      return {
        ...prev,
        firstRoom: isFirstRoom ? roomId : prev.firstRoom,
        currentRoom: roomId,
        roomVisits: updatedVisits,
        switchesCount: isSwitching
          ? prev.switchesCount + 1
          : prev.switchesCount,
        metrics: updatedMetrics,
      };
    });
  }, []);

  // Leave current room
  const leaveRoom = useCallback(() => {
    const now = new Date().toISOString();

    setSession((prev) => {
      if (prev.currentRoom === null) return prev;

      let updatedVisits = [...prev.roomVisits];
      if (
        currentVisitIndexRef.current >= 0 &&
        updatedVisits[currentVisitIndexRef.current]
      ) {
        const visit = updatedVisits[currentVisitIndexRef.current];
        if (!visit.leaveAt) {
          const enterTime = new Date(visit.enterAt).getTime();
          const duration = Date.now() - enterTime;
          updatedVisits[currentVisitIndexRef.current] = {
            ...visit,
            leaveAt: now,
            durationMs: duration,
          };

          // Update room total time
          const roomKey = `room${prev.currentRoom}`;
          return {
            ...prev,
            currentRoom: null,
            roomVisits: updatedVisits,
            metrics: {
              ...prev.metrics,
              [roomKey]: {
                ...prev.metrics[roomKey],
                totalTimeMs: prev.metrics[roomKey].totalTimeMs + duration,
              },
            },
          };
        }
      }

      return {
        ...prev,
        currentRoom: null,
        roomVisits: updatedVisits,
      };
    });

    currentVisitIndexRef.current = -1;
  }, []);

  // Record camera time (Room 1)
  const recordCameraTime = useCallback((durationMs) => {
    setSession((prev) => ({
      ...prev,
      metrics: {
        ...prev.metrics,
        room1: {
          ...prev.metrics.room1,
          cameraOnMs: prev.metrics.room1.cameraOnMs + durationMs,
        },
      },
    }));
  }, []);

  // Record mic time (Room 2)
  const recordMicTime = useCallback((durationMs) => {
    setSession((prev) => ({
      ...prev,
      metrics: {
        ...prev.metrics,
        room2: {
          ...prev.metrics.room2,
          micOnMs: prev.metrics.room2.micOnMs + durationMs,
        },
      },
    }));
  }, []);

  // Record speaking event (Room 2)
  const recordSpeakingEvent = useCallback((durationMs) => {
    setSession((prev) => ({
      ...prev,
      metrics: {
        ...prev.metrics,
        room2: {
          ...prev.metrics.room2,
          speakingEvents: prev.metrics.room2.speakingEvents + 1,
          speakingMs: prev.metrics.room2.speakingMs + durationMs,
        },
      },
    }));
  }, []);

  // Record message sent (Room 4)
  const recordMessageSent = useCallback((messageLength) => {
    const now = Date.now();
    setSession((prev) => {
      const lastMsg = prev.metrics.room4.lastMessageAt;
      const idleTime = lastMsg ? now - new Date(lastMsg).getTime() : 0;

      return {
        ...prev,
        metrics: {
          ...prev.metrics,
          room4: {
            ...prev.metrics.room4,
            messagesSent: prev.metrics.room4.messagesSent + 1,
            totalMessageLength:
              prev.metrics.room4.totalMessageLength + messageLength,
            lastMessageAt: new Date().toISOString(),
            idleTimeMs: prev.metrics.room4.idleTimeMs + idleTime,
          },
        },
      };
    });
  }, []);

  // Record drawing stroke (Room 6)
  const recordStroke = useCallback(() => {
    setSession((prev) => ({
      ...prev,
      metrics: {
        ...prev.metrics,
        room6: {
          ...prev.metrics.room6,
          strokesCount: prev.metrics.room6.strokesCount + 1,
        },
      },
    }));
  }, []);

  // Record drawing time (Room 6)
  const recordDrawingTime = useCallback((durationMs) => {
    setSession((prev) => ({
      ...prev,
      metrics: {
        ...prev.metrics,
        room6: {
          ...prev.metrics.room6,
          drawingMs: prev.metrics.room6.drawingMs + durationMs,
        },
      },
    }));
  }, []);

  // Finish session
  const finishSession = useCallback(async () => {
    const now = new Date().toISOString();

    setSession((prev) => {
      // Close current visit
      let updatedVisits = [...prev.roomVisits];
      let finalMetrics = { ...prev.metrics };

      if (
        currentVisitIndexRef.current >= 0 &&
        updatedVisits[currentVisitIndexRef.current]
      ) {
        const visit = updatedVisits[currentVisitIndexRef.current];
        if (!visit.leaveAt) {
          const enterTime = new Date(visit.enterAt).getTime();
          const duration = Date.now() - enterTime;
          updatedVisits[currentVisitIndexRef.current] = {
            ...visit,
            leaveAt: now,
            durationMs: duration,
          };

          // Update room total time
          const roomKey = `room${prev.currentRoom}`;
          if (finalMetrics[roomKey]) {
            finalMetrics[roomKey] = {
              ...finalMetrics[roomKey],
              totalTimeMs: finalMetrics[roomKey].totalTimeMs + duration,
            };
          }
        }
      }

      // Calculate total time
      const startTime = new Date(prev.sessionStart).getTime();
      const totalTimeMs = Date.now() - startTime;

      const finalSession = {
        ...prev,
        sessionEnd: now,
        currentRoom: null,
        roomVisits: updatedVisits,
        metrics: finalMetrics,
        totalTimeMs,
        completed: true,
      };

      // Post data to endpoint
      postSessionData(finalSession, true);

      return finalSession;
    });

    currentVisitIndexRef.current = -1;
  }, []);

  // Reset session
  const resetSession = useCallback(() => {
    const newSession = createInitialSession();
    currentRoomStartRef.current = null;
    currentVisitIndexRef.current = -1;
    setSession(newSession);
    localStorage.removeItem(STORAGE_KEY);
  }, []);

  // Get computed stats
  const getStats = useCallback(() => {
    const m = session.metrics;
    const avgMessageLength =
      m.room4.messagesSent > 0
        ? Math.round(m.room4.totalMessageLength / m.room4.messagesSent)
        : 0;

    const roomSequence = session.roomVisits.map((v) => v.roomId).join(" → ");

    return {
      participantId: session.participantId,
      firstRoom: session.firstRoom,
      totalTimeMs: session.totalTimeMs,
      switchesCount: session.switchesCount,

      // Room 1
      timeVideoOnlyMs: m.room1.totalTimeMs,
      cameraOnMs: m.room1.cameraOnMs,

      // Room 2
      timeAudioOnlyMs: m.room2.totalTimeMs,
      micOnMs: m.room2.micOnMs,
      speakingEvents: m.room2.speakingEvents,
      speakingMs: m.room2.speakingMs,

      // Room 4
      timeMessagesOnlyMs: m.room4.totalTimeMs,
      messagesSent: m.room4.messagesSent,
      avgMessageLength,

      // Room 6
      timeDrawingMs: m.room6.totalTimeMs,
      strokesCount: m.room6.strokesCount,

      roomSequence,
    };
  }, [session]);

  // Export as JSON
  const exportJSON = useCallback(() => {
    const stats = getStats();
    const exportData = {
      session: {
        participantId: session.participantId,
        sessionStart: session.sessionStart,
        sessionEnd: session.sessionEnd,
        firstRoom: session.firstRoom,
        switchesCount: session.switchesCount,
        totalTimeMs: session.totalTimeMs,
      },
      roomVisits: session.roomVisits,
      metrics: session.metrics,
      stats,
    };

    const blob = new Blob([JSON.stringify(exportData, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `research-session-${session.participantId}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [session, getStats]);

  // Export as CSV
  const exportCSV = useCallback(() => {
    const stats = getStats();

    const headers = [
      "participantId",
      "firstRoom",
      "totalTimeMs",
      "switchesCount",
      "timeVideoOnlyMs",
      "timeAudioOnlyMs",
      "timeMessagesOnlyMs",
      "timeDrawingMs",
      "cameraOnMs",
      "micOnMs",
      "speakingEvents",
      "speakingMs",
      "messagesSent",
      "avgMessageLength",
      "strokesCount",
      "roomSequence",
    ];

    const values = [
      stats.participantId,
      stats.firstRoom || "",
      stats.totalTimeMs,
      stats.switchesCount,
      stats.timeVideoOnlyMs,
      stats.timeAudioOnlyMs,
      stats.timeMessagesOnlyMs,
      stats.timeDrawingMs,
      stats.cameraOnMs,
      stats.micOnMs,
      stats.speakingEvents,
      stats.speakingMs,
      stats.messagesSent,
      stats.avgMessageLength,
      stats.strokesCount,
      `"${stats.roomSequence}"`,
    ];

    const csv = headers.join(",") + "\n" + values.join(",");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `research-session-${session.participantId}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [session, getStats]);

  return {
    session,
    enterRoom,
    leaveRoom,
    recordCameraTime,
    recordMicTime,
    recordSpeakingEvent,
    recordMessageSent,
    recordStroke,
    recordDrawingTime,
    finishSession,
    resetSession,
    getStats,
    exportJSON,
    exportCSV,
  };
}

// Post session data to Google Apps Script endpoint
async function postSessionData(session, isFinal = false) {
  // Skip if no endpoint configured
  if (!DATA_ENDPOINT) {
    return;
  }

  const stats = calculateStats(session);

  const payload = {
    participantId: session.participantId,
    sessionStart: session.sessionStart,
    sessionEnd: session.sessionEnd,
    firstRoom: session.firstRoom,
    totalTimeMs: session.totalTimeMs,
    switchesCount: session.switchesCount,

    // Room metrics
    timeVideoOnlyMs: session.metrics.room1.totalTimeMs,
    cameraOnMs: session.metrics.room1.cameraOnMs,
    timeAudioOnlyMs: session.metrics.room2.totalTimeMs,
    micOnMs: session.metrics.room2.micOnMs,
    speakingEvents: session.metrics.room2.speakingEvents,
    speakingMs: session.metrics.room2.speakingMs,
    timeMessagesOnlyMs: session.metrics.room4.totalTimeMs,
    messagesSent: session.metrics.room4.messagesSent,
    avgMessageLength: stats.avgMessageLength,
    timeDrawingMs: session.metrics.room6.totalTimeMs,
    strokesCount: session.metrics.room6.strokesCount,

    roomSequence: session.roomVisits.map((v) => v.roomId).join(" → "),
    isFinal,
    timestamp: new Date().toISOString(),
  };

  try {
    await fetch(DATA_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      mode: "no-cors", // Google Apps Script requires this
    });

    console.log("[Session] Data posted to Google Apps Script");
  } catch (err) {
    console.error("[Session] Failed to post data:", err);

    // Retry once on final submission
    if (isFinal) {
      setTimeout(async () => {
        try {
          await fetch(DATA_ENDPOINT, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
            mode: "no-cors",
          });
        } catch (retryErr) {
          console.error("[Session] Retry failed:", retryErr);
        }
      }, 3000);
    }
  }
}

// Calculate stats helper
function calculateStats(session) {
  const m = session.metrics;
  return {
    avgMessageLength:
      m.room4.messagesSent > 0
        ? Math.round(m.room4.totalMessageLength / m.room4.messagesSent)
        : 0,
  };
}
