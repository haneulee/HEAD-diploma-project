/**
 * Room 1: Video Only (WebRTC Multi-Peer)
 * Camera REQUIRED, microphone always OFF
 * Shows local preview + remote peer videos
 */

import { useCallback, useEffect, useRef, useState } from "react";

// STUN servers for NAT traversal
const RTC_CONFIG = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
  ],
};

export function Room1VideoOnly({
  participantId,
  presenceCount,
  onCameraTime,
  sendRtcSignal,
  registerHandlers,
}) {
  const [hasPermission, setHasPermission] = useState(null);
  const [error, setError] = useState(null);
  const [isCameraOn, setIsCameraOn] = useState(false);
  const [localStream, setLocalStream] = useState(null);
  const [remoteStreams, setRemoteStreams] = useState({}); // peerId -> MediaStream

  const localVideoRef = useRef(null);
  const cameraStartRef = useRef(null);
  const trackingIntervalRef = useRef(null);
  const peersRef = useRef({}); // peerId -> RTCPeerConnection
  const localStreamRef = useRef(null); // Ref for handlers to access stream
  const pendingUsersRef = useRef([]); // Users to connect when stream is ready
  const pendingOffersRef = useRef([]); // Offers to process when stream is ready

  // Request camera permission and start stream
  const startCamera = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: "user",
          width: { ideal: 640 },
          height: { ideal: 480 },
        },
        audio: false, // Never request audio in Room 1
      });

      setLocalStream(stream);
      localStreamRef.current = stream; // Store in ref for handlers

      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
      }

      // Connect to any pending users that arrived before stream was ready
      if (pendingUsersRef.current.length > 0) {
        console.log(
          "[Room1] Connecting to pending users:",
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
          "[Room1] Processing pending offers:",
          pendingOffersRef.current.length
        );
        pendingOffersRef.current.forEach(({ fromId, offer }) => {
          handleOffer(fromId, offer, stream);
        });
        pendingOffersRef.current = [];
      }

      setHasPermission(true);
      setIsCameraOn(true);
      cameraStartRef.current = Date.now();

      // Track camera time every second
      trackingIntervalRef.current = setInterval(() => {
        if (cameraStartRef.current) {
          const elapsed = Date.now() - cameraStartRef.current;
          if (elapsed >= 1000) {
            onCameraTime(1000);
            cameraStartRef.current = Date.now();
          }
        }
      }, 1000);

      return stream;
    } catch (err) {
      console.error("[Room1] Camera error:", err);
      setHasPermission(false);
      setError(
        err.name === "NotAllowedError"
          ? "Camera permission denied. Please allow camera access to enter this room."
          : "Could not access camera. Please check your device settings."
      );
      return null;
    }
  }, [onCameraTime]);

  // Create peer connection
  const createPeerConnection = useCallback(
    (peerId, stream) => {
      if (peersRef.current[peerId]) {
        console.log(`[RTC] Peer ${peerId} already exists`);
        return peersRef.current[peerId];
      }

      console.log(`[RTC] Creating peer connection to ${peerId}`);
      const pc = new RTCPeerConnection(RTC_CONFIG);

      // Add local stream tracks
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

      // Handle remote stream
      pc.ontrack = (event) => {
        console.log(`[RTC] Received track from ${peerId}`);
        const [remoteStream] = event.streams;
        if (remoteStream) {
          setRemoteStreams((prev) => ({
            ...prev,
            [peerId]: remoteStream,
          }));
        }
      };

      // Handle connection state
      pc.onconnectionstatechange = () => {
        console.log(`[RTC] ${peerId} state: ${pc.connectionState}`);
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
      setRemoteStreams((prev) => {
        const newStreams = { ...prev };
        delete newStreams[peerId];
        return newStreams;
      });
      console.log(`[RTC] Removed peer ${peerId}`);
    }
  }, []);

  // Connect to a peer (initiator)
  const connectToPeer = useCallback(
    async (peerId, stream) => {
      // Skip if already connected
      if (peersRef.current[peerId]) {
        console.log(`[RTC] Already connected to ${peerId}, skipping`);
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

        console.log(`[RTC] Sent offer to ${peerId}`);
      } catch (err) {
        console.error(`[RTC] Error creating offer:`, err);
        removePeer(peerId);
      }
    },
    [createPeerConnection, sendRtcSignal, removePeer]
  );

  // Handle incoming offer
  const handleOffer = useCallback(
    async (fromId, offer, stream) => {
      console.log(`[RTC] Received offer from ${fromId}`);

      // If connection exists, close it first to allow renegotiation
      if (peersRef.current[fromId]) {
        console.log(
          `[RTC] Closing existing connection to ${fromId} for renegotiation`
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

        console.log(`[RTC] Sent answer to ${fromId}`);
      } catch (err) {
        console.error(`[RTC] Error handling offer:`, err);
        removePeer(fromId);
      }
    },
    [createPeerConnection, sendRtcSignal, removePeer]
  );

  // Handle incoming answer
  const handleAnswer = useCallback(async (fromId, answer) => {
    console.log(`[RTC] Received answer from ${fromId}`);
    const pc = peersRef.current[fromId];
    if (pc) {
      try {
        await pc.setRemoteDescription(new RTCSessionDescription(answer));
      } catch (err) {
        console.error(`[RTC] Error handling answer:`, err);
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
        console.error(`[RTC] Error adding ICE candidate:`, err);
      }
    }
  }, []);

  // Stop camera and cleanup
  const stopCamera = useCallback(() => {
    // Record final camera time
    if (cameraStartRef.current) {
      const elapsed = Date.now() - cameraStartRef.current;
      if (elapsed > 0) {
        onCameraTime(elapsed);
      }
      cameraStartRef.current = null;
    }

    // Clear tracking interval
    if (trackingIntervalRef.current) {
      clearInterval(trackingIntervalRef.current);
      trackingIntervalRef.current = null;
    }

    // Close all peer connections
    Object.keys(peersRef.current).forEach((peerId) => {
      peersRef.current[peerId].close();
    });
    peersRef.current = {};
    setRemoteStreams({});

    // Stop local stream
    if (localStream) {
      localStream.getTracks().forEach((track) => track.stop());
      setLocalStream(null);
    }

    if (localVideoRef.current) {
      localVideoRef.current.srcObject = null;
    }

    setIsCameraOn(false);
  }, [onCameraTime, localStream]);

  // Ensure local video element has the stream
  useEffect(() => {
    if (localVideoRef.current && localStream) {
      localVideoRef.current.srcObject = localStream;
      // Ensure video plays
      localVideoRef.current.play().catch((e) => {
        console.log("[Room1] Video autoplay blocked:", e);
      });
    }
  }, [localStream]);

  // Register handlers immediately on mount (before camera starts)
  useEffect(() => {
    if (registerHandlers) {
      registerHandlers({
        onRoomUsers: (users) => {
          // Connect to existing users in room
          console.log("[Room1] Got room users:", users);
          users.forEach((userId) => {
            if (userId !== participantId) {
              if (localStreamRef.current) {
                // Stream ready, connect now
                connectToPeer(userId, localStreamRef.current);
              } else {
                // Stream not ready, save for later
                console.log("[Room1] Stream not ready, queuing user:", userId);
                pendingUsersRef.current.push(userId);
              }
            }
          });
        },
        onUserJoined: (userId) => {
          // New user joined - they will send us an offer via onRoomUsers
          console.log(`[Room1] User ${userId} joined, waiting for their offer`);
        },
        onUserLeft: (userId) => {
          removePeer(userId);
        },
        onRtcOffer: (fromId, offer) => {
          console.log(`[Room1] Received offer from ${fromId}`);
          if (localStreamRef.current) {
            handleOffer(fromId, offer, localStreamRef.current);
          } else {
            // Stream not ready, queue the offer
            console.log(
              "[Room1] Stream not ready, queuing offer from:",
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

  // Start camera on mount
  useEffect(() => {
    let mounted = true;

    const init = async () => {
      if (mounted) {
        await startCamera();
      }
    };

    init();

    return () => {
      mounted = false;
      stopCamera();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Handle visibility change
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden && cameraStartRef.current) {
        const elapsed = Date.now() - cameraStartRef.current;
        if (elapsed > 0) {
          onCameraTime(elapsed);
        }
        cameraStartRef.current = null;
      } else if (!document.hidden && isCameraOn) {
        cameraStartRef.current = Date.now();
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () =>
      document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, [isCameraOn, onCameraTime]);

  // Permission denied view
  if (hasPermission === false) {
    return (
      <div className="room-permission-denied">
        <div className="permission-icon">📹</div>
        <h3>Camera Required</h3>
        <p>{error}</p>
        <button className="btn-retry" onClick={startCamera}>
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
        <p>Requesting camera access...</p>
      </div>
    );
  }

  const remoteUserIds = Object.keys(remoteStreams);
  const totalVideos = 1 + remoteUserIds.length; // local + remotes

  return (
    <div className="room1-content">
      <div className={`video-grid videos-${Math.min(totalVideos, 6)}`}>
        {/* Local video */}
        <div className="video-container local">
          <video
            ref={localVideoRef}
            autoPlay
            playsInline
            muted
            className="video-element"
          />
          <div className="video-label">You</div>
        </div>

        {/* Remote videos */}
        {remoteUserIds.map((peerId) => (
          <RemoteVideo
            key={peerId}
            peerId={peerId}
            stream={remoteStreams[peerId]}
          />
        ))}
      </div>

      <div className="room-info">
        <div className="presence-indicator">
          <span className="presence-dot active" />
          <span>
            {presenceCount} {presenceCount === 1 ? "person" : "people"} in room
          </span>
        </div>
        <p className="room-note">🔇 Audio is OFF. Video only.</p>
      </div>
    </div>
  );
}

// Remote video component
function RemoteVideo({ peerId, stream }) {
  const videoRef = useRef(null);

  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
    }
  }, [stream]);

  return (
    <div className="video-container remote">
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted={false}
        className="video-element"
      />
      <div className="video-label">{peerId.slice(0, 8)}</div>
    </div>
  );
}
