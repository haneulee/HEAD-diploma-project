/**
 * Session Management Hook
 * Tracks participant data, room visits, and behavioral metrics
 * Handles data persistence and export
 */

import { AUTO_SAVE_INTERVAL, DATA_ENDPOINT } from "../config/api";
import { useCallback, useEffect, useRef, useState } from "react";

const STORAGE_KEY = "research_session_v4"; // v4: Room IDs changed to 1,2,3,4

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
    roomVisits: [],
    // Each visit: {
    //   roomId, enterAt, leaveAt, durationMs,
    //   hasInteracted, firstInteractionDelayMs, exitWithoutInteraction
    // }

    // Per-room metrics
    metrics: {
      room1: {
        totalTimeMs: 0,
        visits: 0,
        // Room 1: No interaction possible (video only, muted)
      },
      room2: {
        totalTimeMs: 0,
        speakingEvents: 0,
        speakingMs: 0,
        visits: 0,
      },
      room3: {
        totalTimeMs: 0,
        messagesSent: 0,
        totalMessageLength: 0,
        visits: 0,
      },
      room4: {
        totalTimeMs: 0,
        strokesCount: 0,
        visits: 0,
      },
    },

    // Global metrics
    switchesCount: 0,
    totalTimeMs: 0,
    firstInteractionDelayMs: null, // First interaction across entire session
    idleTimeWithOthersMs: 0, // Time with others but no interaction

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
  const hasInteractedRef = useRef(false);
  const firstInteractionTimeRef = useRef(null);
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
    const nowMs = Date.now();
    currentRoomStartRef.current = nowMs;
    hasInteractedRef.current = false;
    firstInteractionTimeRef.current = null;

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
          const duration = nowMs - enterTime;
          updatedVisits[currentVisitIndexRef.current] = {
            ...visit,
            leaveAt: now,
            durationMs: duration,
            exitWithoutInteraction: !visit.hasInteracted,
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
        hasInteracted: false,
        firstInteractionDelayMs: null,
        exitWithoutInteraction: false,
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
    const nowMs = Date.now();

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
          const duration = nowMs - enterTime;
          updatedVisits[currentVisitIndexRef.current] = {
            ...visit,
            leaveAt: now,
            durationMs: duration,
            hasInteracted: hasInteractedRef.current,
            firstInteractionDelayMs: firstInteractionTimeRef.current
              ? firstInteractionTimeRef.current - enterTime
              : null,
            exitWithoutInteraction: !hasInteractedRef.current,
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
    hasInteractedRef.current = false;
    firstInteractionTimeRef.current = null;
  }, []);

  // Record first interaction (called by room-specific handlers)
  const recordFirstInteraction = useCallback(() => {
    if (!hasInteractedRef.current) {
      hasInteractedRef.current = true;
      firstInteractionTimeRef.current = Date.now();

      // Update session's global first interaction delay
      setSession((prev) => {
        if (
          prev.firstInteractionDelayMs === null &&
          currentRoomStartRef.current
        ) {
          const delay = Date.now() - currentRoomStartRef.current;
          return {
            ...prev,
            firstInteractionDelayMs: delay,
          };
        }
        return prev;
      });
    }
  }, []);

  // Record idle time with others (call every second when presenceCount > 1 and not interacted)
  const recordIdleTimeWithOthers = useCallback((durationMs = 1000) => {
    if (!hasInteractedRef.current) {
      setSession((prev) => ({
        ...prev,
        idleTimeWithOthersMs: prev.idleTimeWithOthersMs + durationMs,
      }));
    }
  }, []);

  // Record speaking event (Room 2) - marks as interaction
  const recordSpeakingEvent = useCallback(
    (durationMs) => {
      recordFirstInteraction();
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
    },
    [recordFirstInteraction]
  );

  // Record message sent (Room 3) - marks as interaction
  const recordMessageSent = useCallback(
    (messageLength) => {
      recordFirstInteraction();
      setSession((prev) => ({
        ...prev,
        metrics: {
          ...prev.metrics,
          room3: {
            ...prev.metrics.room3,
            messagesSent: prev.metrics.room3.messagesSent + 1,
            totalMessageLength:
              prev.metrics.room3.totalMessageLength + messageLength,
          },
        },
      }));
    },
    [recordFirstInteraction]
  );

  // Record drawing stroke (Room 4) - marks as interaction
  const recordStroke = useCallback(() => {
    recordFirstInteraction();
    setSession((prev) => ({
      ...prev,
      metrics: {
        ...prev.metrics,
        room4: {
          ...prev.metrics.room4,
          strokesCount: prev.metrics.room4.strokesCount + 1,
        },
      },
    }));
  }, [recordFirstInteraction]);

  // Finish session
  const finishSession = useCallback(async () => {
    const now = new Date().toISOString();
    const nowMs = Date.now();

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
          const duration = nowMs - enterTime;
          updatedVisits[currentVisitIndexRef.current] = {
            ...visit,
            leaveAt: now,
            durationMs: duration,
            hasInteracted: hasInteractedRef.current,
            firstInteractionDelayMs: firstInteractionTimeRef.current
              ? firstInteractionTimeRef.current - enterTime
              : null,
            exitWithoutInteraction: !hasInteractedRef.current,
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
      const totalTimeMs = nowMs - startTime;

      const finalSession = {
        ...prev,
        sessionEnd: now,
        currentRoom: null,
        roomVisits: updatedVisits,
        metrics: finalMetrics,
        totalTimeMs,
        completed: true,
      };

      // Don't post data here - wait for feedback submission
      return finalSession;
    });

    currentVisitIndexRef.current = -1;
    hasInteractedRef.current = false;
    firstInteractionTimeRef.current = null;
  }, []);

  // Reset session
  const resetSession = useCallback(() => {
    const newSession = createInitialSession();
    currentRoomStartRef.current = null;
    currentVisitIndexRef.current = -1;
    hasInteractedRef.current = false;
    firstInteractionTimeRef.current = null;
    setSession(newSession);
    localStorage.removeItem(STORAGE_KEY);
  }, []);

  // Get computed stats
  const getStats = useCallback(() => {
    const m = session.metrics;
    const avgMessageLength =
      m.room3.messagesSent > 0
        ? Math.round(m.room3.totalMessageLength / m.room3.messagesSent)
        : 0;

    const roomSequence = session.roomVisits.map((v) => v.roomId).join(" → ");

    // Count exits without interaction
    const exitWithoutInteractionCount = session.roomVisits.filter(
      (v) => v.exitWithoutInteraction
    ).length;

    return {
      participantId: session.participantId,
      firstRoom: session.firstRoom,
      totalTimeMs: session.totalTimeMs,
      switchesCount: session.switchesCount,

      // Room times
      timeVideoOnlyMs: m.room1.totalTimeMs,
      timeAudioOnlyMs: m.room2.totalTimeMs,
      timeMessagesOnlyMs: m.room3.totalTimeMs,
      timeDrawingMs: m.room4.totalTimeMs,

      // Room 2 metrics
      speakingEvents: m.room2.speakingEvents,
      speakingMs: m.room2.speakingMs,

      // Room 3 metrics
      messagesSent: m.room3.messagesSent,
      avgMessageLength,

      // Room 4 metrics
      strokesCount: m.room4.strokesCount,

      // Global interaction metrics
      firstInteractionDelayMs: session.firstInteractionDelayMs,
      idleTimeWithOthersMs: session.idleTimeWithOthersMs,
      exitWithoutInteraction: exitWithoutInteractionCount,

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
        firstInteractionDelayMs: session.firstInteractionDelayMs,
        idleTimeWithOthersMs: session.idleTimeWithOthersMs,
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
      "speakingEvents",
      "speakingMs",
      "messagesSent",
      "avgMessageLength",
      "strokesCount",
      "firstInteractionDelayMs",
      "idleTimeWithOthersMs",
      "exitWithoutInteraction",
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
      stats.speakingEvents,
      stats.speakingMs,
      stats.messagesSent,
      stats.avgMessageLength,
      stats.strokesCount,
      stats.firstInteractionDelayMs || "",
      stats.idleTimeWithOthersMs,
      stats.exitWithoutInteraction,
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

  // Check if currently interacted (for idle tracking)
  const hasInteracted = useCallback(() => {
    return hasInteractedRef.current;
  }, []);

  return {
    session,
    enterRoom,
    leaveRoom,
    recordSpeakingEvent,
    recordMessageSent,
    recordStroke,
    recordIdleTimeWithOthers,
    hasInteracted,
    finishSession,
    resetSession,
    getStats,
    exportJSON,
    exportCSV,
  };
}

// Post session data to Google Apps Script endpoint
export async function postSessionData(session, feedback = "", isFinal = false) {
  if (!DATA_ENDPOINT) {
    return;
  }

  const m = session.metrics;
  const avgMessageLength =
    m.room3.messagesSent > 0
      ? Math.round(m.room3.totalMessageLength / m.room3.messagesSent)
      : 0;

  const exitWithoutInteractionCount = session.roomVisits.filter(
    (v) => v.exitWithoutInteraction
  ).length;

  const payload = {
    participantId: session.participantId,
    sessionStart: session.sessionStart,
    sessionEnd: session.sessionEnd,
    firstRoom: session.firstRoom,
    totalTimeMs: session.totalTimeMs,
    switchesCount: session.switchesCount,

    // Room times
    timeVideoOnlyMs: m.room1.totalTimeMs,
    timeAudioOnlyMs: m.room2.totalTimeMs,
    timeMessagesOnlyMs: m.room3.totalTimeMs,
    timeDrawingMs: m.room4.totalTimeMs,

    // Room 2
    speakingEvents: m.room2.speakingEvents,
    speakingMs: m.room2.speakingMs,

    // Room 3
    messagesSent: m.room3.messagesSent,
    avgMessageLength,

    // Room 4
    strokesCount: m.room4.strokesCount,

    // Global interaction metrics
    firstInteractionDelayMs: session.firstInteractionDelayMs,
    idleTimeWithOthersMs: session.idleTimeWithOthersMs,
    exitWithoutInteraction: exitWithoutInteractionCount,

    roomSequence: session.roomVisits.map((v) => v.roomId).join(" → "),
    feedback: feedback || "",
    isFinal,
    timestamp: new Date().toISOString(),
  };

  try {
    await fetch(DATA_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      mode: "no-cors",
    });
    console.log("[Session] Data posted to Google Apps Script");
  } catch (err) {
    console.error("[Session] Failed to post data:", err);
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
