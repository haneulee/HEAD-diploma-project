/**
 * Room 2: Audio Only (WebRTC Multi-Peer)
 * Microphone REQUIRED, no video
 * Uses WebRTC for audio streaming + Web Audio API for speaking detection
 */

import { useCallback, useEffect, useRef, useState } from "react";

const VOLUME_THRESHOLD = 0.02;
const SPEECH_DEBOUNCE_MS = 200;

// STUN servers for NAT traversal
const RTC_CONFIG = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
  ],
};

export function Room2AudioOnly({
  participantId,
  presenceCount,
  onSpeakingEvent,
  onIdleWithOthers,
  hasInteracted,
  sendRtcSignal,
  registerHandlers,
}) {
  const [hasPermission, setHasPermission] = useState(null);
  const [error, setError] = useState(null);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [volume, setVolume] = useState(0);
  const [remotePeers, setRemotePeers] = useState({}); // peerId -> { speaking: boolean }

  const audioContextRef = useRef(null);
  const analyserRef = useRef(null);
  const animationFrameRef = useRef(null);

  const idleTrackingRef = useRef(null);

  const speakingStartRef = useRef(null);
  const speechTimeoutRef = useRef(null);

  const peersRef = useRef({}); // peerId -> RTCPeerConnection
  const remoteAudioRefs = useRef({}); // peerId -> HTMLAudioElement
  const localStreamRef = useRef(null); // Ref for handlers to access stream
  const pendingUsersRef = useRef([]); // Users to connect when stream is ready
  const pendingOffersRef = useRef([]); // Offers to process when stream is ready
  const presenceCountRef = useRef(presenceCount);
  const hasInteractedRef = useRef(hasInteracted);

  const onSpeakingEventRef = useRef(onSpeakingEvent);
  onSpeakingEventRef.current = onSpeakingEvent;

  // Keep refs updated
  useEffect(() => {
    presenceCountRef.current = presenceCount;
  }, [presenceCount]);

  useEffect(() => {
    hasInteractedRef.current = hasInteracted;
  }, [hasInteracted]);

  // Analyze audio for speaking detection
  const startAnalyzing = useCallback(() => {
    const analyser = analyserRef.current;
    if (!analyser) return;

    const dataArray = new Uint8Array(analyser.frequencyBinCount);

    const analyze = () => {
      analyser.getByteFrequencyData(dataArray);

      let sum = 0;
      for (let i = 0; i < dataArray.length; i++) {
        sum += dataArray[i];
      }
      const average = sum / dataArray.length / 255;
      setVolume(average);

      const isCurrentlySpeaking = average > VOLUME_THRESHOLD;

      if (isCurrentlySpeaking) {
        if (!speakingStartRef.current) {
          speakingStartRef.current = Date.now();
          setIsSpeaking(true);
        }

        if (speechTimeoutRef.current) {
          clearTimeout(speechTimeoutRef.current);
          speechTimeoutRef.current = null;
        }
      } else if (speakingStartRef.current) {
        if (!speechTimeoutRef.current) {
          speechTimeoutRef.current = setTimeout(() => {
            if (speakingStartRef.current) {
              const speakingDuration = Date.now() - speakingStartRef.current;
              if (speakingDuration > 100) {
                onSpeakingEventRef.current(speakingDuration);
              }
              speakingStartRef.current = null;
              setIsSpeaking(false);
            }
            speechTimeoutRef.current = null;
          }, SPEECH_DEBOUNCE_MS);
        }
      }

      animationFrameRef.current = requestAnimationFrame(analyze);
    };

    analyze();
  }, []);

  // Create peer connection for audio
  const createPeerConnection = useCallback(
    (peerId, stream) => {
      if (peersRef.current[peerId]) {
        return peersRef.current[peerId];
      }

      console.log(`[RTC Audio] Creating peer connection to ${peerId}`);
      const pc = new RTCPeerConnection(RTC_CONFIG);

      // Add local audio track
      if (stream) {
        stream.getTracks().forEach((track) => {
          pc.addTrack(track, stream);
        });
      }

      // Handle ICE candidates
      pc.onicecandidate = (event) => {
        if (event.candidate) {
          sendRtcSignal({
            type: "rtc_ice_candidate",
            targetId: peerId,
            candidate: event.candidate,
          });
        }
      };

      // Handle remote audio stream
      pc.ontrack = (event) => {
        console.log(`[RTC Audio] Received audio from ${peerId}`);
        const [remoteStream] = event.streams;
        if (remoteStream) {
          // Create audio element for playback
          let audioEl = remoteAudioRefs.current[peerId];
          if (!audioEl) {
            audioEl = new Audio();
            audioEl.autoplay = true;
            remoteAudioRefs.current[peerId] = audioEl;
          }
          audioEl.srcObject = remoteStream;

          setRemotePeers((prev) => ({
            ...prev,
            [peerId]: { speaking: false },
          }));
        }
      };

      // Handle connection state
      pc.onconnectionstatechange = () => {
        console.log(`[RTC Audio] ${peerId} state: ${pc.connectionState}`);
        if (
          pc.connectionState === "disconnected" ||
          pc.connectionState === "failed" ||
          pc.connectionState === "closed"
        ) {
          removePeer(peerId);
        }
      };

      peersRef.current[peerId] = pc;
      return pc;
    },
    [sendRtcSignal]
  );

  // Remove peer connection
  const removePeer = useCallback((peerId) => {
    const pc = peersRef.current[peerId];
    if (pc) {
      pc.close();
      delete peersRef.current[peerId];
    }

    const audioEl = remoteAudioRefs.current[peerId];
    if (audioEl) {
      audioEl.srcObject = null;
      delete remoteAudioRefs.current[peerId];
    }

    setRemotePeers((prev) => {
      const newPeers = { ...prev };
      delete newPeers[peerId];
      return newPeers;
    });

    console.log(`[RTC Audio] Removed peer ${peerId}`);
  }, []);

  // Connect to a peer
  const connectToPeer = useCallback(
    async (peerId, stream) => {
      // Skip if already connected
      if (peersRef.current[peerId]) {
        console.log(`[RTC Audio] Already connected to ${peerId}, skipping`);
        return;
      }

      const pc = createPeerConnection(peerId, stream);

      try {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);

        sendRtcSignal({
          type: "rtc_offer",
          targetId: peerId,
          offer: pc.localDescription,
        });

        console.log(`[RTC Audio] Sent offer to ${peerId}`);
      } catch (err) {
        console.error(`[RTC Audio] Error creating offer:`, err);
        removePeer(peerId);
      }
    },
    [createPeerConnection, sendRtcSignal, removePeer]
  );

  // Handle incoming offer
  const handleOffer = useCallback(
    async (fromId, offer, stream) => {
      console.log(`[RTC Audio] Received offer from ${fromId}`);

      // If connection exists, close it first to allow renegotiation
      if (peersRef.current[fromId]) {
        console.log(
          `[RTC Audio] Closing existing connection to ${fromId} for renegotiation`
        );
        peersRef.current[fromId].close();
        delete peersRef.current[fromId];
      }

      const pc = createPeerConnection(fromId, stream);

      try {
        await pc.setRemoteDescription(new RTCSessionDescription(offer));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);

        sendRtcSignal({
          type: "rtc_answer",
          targetId: fromId,
          answer: pc.localDescription,
        });
      } catch (err) {
        console.error(`[RTC Audio] Error handling offer:`, err);
        removePeer(fromId);
      }
    },
    [createPeerConnection, sendRtcSignal, removePeer]
  );

  // Handle incoming answer
  const handleAnswer = useCallback(async (fromId, answer) => {
    const pc = peersRef.current[fromId];
    if (pc) {
      try {
        await pc.setRemoteDescription(new RTCSessionDescription(answer));
      } catch (err) {
        console.error(`[RTC Audio] Error handling answer:`, err);
      }
    }
  }, []);

  // Handle ICE candidate
  const handleIceCandidate = useCallback(async (fromId, candidate) => {
    const pc = peersRef.current[fromId];
    if (pc && candidate) {
      try {
        await pc.addIceCandidate(new RTCIceCandidate(candidate));
      } catch (err) {
        console.error(`[RTC Audio] Error adding ICE candidate:`, err);
      }
    }
  }, []);

  // Start microphone
  const startMic = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: false,
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
        },
      });

      localStreamRef.current = stream; // Store in ref for handlers

      // Connect to any pending users that arrived before stream was ready
      if (pendingUsersRef.current.length > 0) {
        console.log(
          "[Room2] Connecting to pending users:",
          pendingUsersRef.current
        );
        pendingUsersRef.current.forEach((userId) => {
          connectToPeer(userId, stream);
        });
        pendingUsersRef.current = [];
      }

      // Process any pending offers that arrived before stream was ready
      if (pendingOffersRef.current.length > 0) {
        console.log(
          "[Room2] Processing pending offers:",
          pendingOffersRef.current.length
        );
        pendingOffersRef.current.forEach(({ fromId, offer }) => {
          handleOffer(fromId, offer, stream);
        });
        pendingOffersRef.current = [];
      }

      // Set up Web Audio API for volume analysis
      const audioContext = new (window.AudioContext ||
        window.webkitAudioContext)();
      audioContextRef.current = audioContext;

      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.8;
      analyserRef.current = analyser;

      const source = audioContext.createMediaStreamSource(stream);
      source.connect(analyser);

      startAnalyzing();

      setHasPermission(true);

      // Track idle time with others (when not interacted and others present)
      idleTrackingRef.current = setInterval(() => {
        if (presenceCountRef.current > 1 && !hasInteractedRef.current()) {
          onIdleWithOthers(1000);
        }
      }, 1000);

      return stream;
    } catch (err) {
      console.error("[Room2] Microphone error:", err);
      setHasPermission(false);
      setError(
        err.name === "NotAllowedError"
          ? "Microphone permission denied. Please allow microphone access to enter this room."
          : "Could not access microphone. Please check your device settings."
      );
      return null;
    }
  }, [startAnalyzing]);

  // Stop microphone and cleanup
  const stopMic = useCallback(() => {
    console.log("[Room2] Stopping mic and closing connections");

    // Record final speaking event if still speaking
    if (speakingStartRef.current) {
      const speakingDuration = Date.now() - speakingStartRef.current;
      if (speakingDuration > 100) {
        onSpeakingEvent(speakingDuration);
      }
      speakingStartRef.current = null;
    }

    if (idleTrackingRef.current) {
      clearInterval(idleTrackingRef.current);
      idleTrackingRef.current = null;
    }
    if (speechTimeoutRef.current) {
      clearTimeout(speechTimeoutRef.current);
      speechTimeoutRef.current = null;
    }
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }

    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }

    // Close all peer connections
    Object.keys(peersRef.current).forEach((peerId) => {
      console.log("[Room2] Closing peer connection:", peerId);
      peersRef.current[peerId].close();
    });
    peersRef.current = {};

    // Clean up audio elements
    Object.values(remoteAudioRefs.current).forEach((audioEl) => {
      audioEl.srcObject = null;
    });
    remoteAudioRefs.current = {};

    // Clear pending queues
    pendingUsersRef.current = [];
    pendingOffersRef.current = [];

    setRemotePeers({});

    // Stop local stream using ref (more reliable than state)
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => {
        console.log("[Room2] Stopping track:", track.kind);
        track.stop();
      });
      localStreamRef.current = null;
    }

    setIsSpeaking(false);
    setVolume(0);
  }, [onSpeakingEvent]);

  // Register handlers immediately on mount (before mic starts)
  useEffect(() => {
    if (registerHandlers) {
      registerHandlers({
        onRoomUsers: (users) => {
          console.log("[Room2] Got room users:", users);
          users.forEach((userId) => {
            if (userId !== participantId) {
              if (localStreamRef.current) {
                // Stream ready, connect now
                connectToPeer(userId, localStreamRef.current);
              } else {
                // Stream not ready, save for later
                console.log("[Room2] Stream not ready, queuing user:", userId);
                pendingUsersRef.current.push(userId);
              }
            }
          });
        },
        onUserJoined: (userId) => {
          console.log(`[Room2] User ${userId} joined, waiting for their offer`);
        },
        onUserLeft: (userId) => {
          removePeer(userId);
        },
        onRtcOffer: (fromId, offer) => {
          console.log(`[Room2] Received offer from ${fromId}`);
          if (localStreamRef.current) {
            handleOffer(fromId, offer, localStreamRef.current);
          } else {
            // Stream not ready, queue the offer
            console.log(
              "[Room2] Stream not ready, queuing offer from:",
              fromId
            );
            pendingOffersRef.current.push({ fromId, offer });
          }
        },
        onRtcAnswer: (fromId, answer) => {
          handleAnswer(fromId, answer);
        },
        onRtcIceCandidate: (fromId, candidate) => {
          handleIceCandidate(fromId, candidate);
        },
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [registerHandlers]);

  // Start mic on mount
  useEffect(() => {
    let mounted = true;

    const init = async () => {
      if (mounted) {
        await startMic();
      }
    };

    init();

    return () => {
      mounted = false;
      stopMic();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Permission denied view
  if (hasPermission === false) {
    return (
      <div className="room-permission-denied">
        <div className="permission-icon">🎤</div>
        <h3>Microphone Required</h3>
        <p>{error}</p>
        <button className="btn-retry" onClick={startMic}>
          Try Again
        </button>
      </div>
    );
  }

  // Loading view
  if (hasPermission === null) {
    return (
      <div className="room-loading">
        <div className="loading-spinner" />
        <p>Requesting microphone access...</p>
      </div>
    );
  }

  const remotePeerIds = Object.keys(remotePeers);

  return (
    <div className="room2-content">
      <div className="audio-participants">
        {/* Local user */}
        <div className={`audio-participant ${isSpeaking ? "speaking" : ""}`}>
          <div className="audio-avatar">
            <span>🎤</span>
            <div
              className="volume-ring"
              style={{
                transform: `scale(${1 + volume * 2})`,
                opacity: isSpeaking ? 0.8 : 0.3,
              }}
            />
          </div>
          <div className="audio-label">You</div>
          <div className="audio-status">
            {isSpeaking ? "Speaking..." : "Listening"}
          </div>
        </div>

        {/* Remote participants */}
        {remotePeerIds.map((peerId) => (
          <div key={peerId} className="audio-participant">
            <div className="audio-avatar">
              <span>🔊</span>
            </div>
            <div className="audio-label">{peerId.slice(0, 8)}</div>
            <div className="audio-status">Connected</div>
          </div>
        ))}
      </div>

      <div className="volume-visualizer">
        <div className="volume-meter-horizontal">
          <div
            className="volume-bar-horizontal"
            style={{
              width: `${Math.min(volume * 300, 100)}%`,
              backgroundColor: isSpeaking
                ? "var(--room2-color)"
                : "var(--text-muted)",
            }}
          />
        </div>
        <p className="volume-label">Your mic level</p>
      </div>

      <div className="room-info">
        <div className="presence-indicator">
          <span className="presence-dot active" />
          <span>
            {presenceCount} {presenceCount === 1 ? "person" : "people"} in room
          </span>
        </div>
        <p className="room-note">📷 No video. Audio only.</p>
      </div>
    </div>
  );
}
