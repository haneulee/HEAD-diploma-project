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
  onIdleWithOthers,
  sendRtcSignal,
  registerHandlers,
}) {
  const [hasPermission, setHasPermission] = useState(null);
  const [error, setError] = useState(null);
  const [localStream, setLocalStream] = useState(null);
  const [remoteStreams, setRemoteStreams] = useState({}); // peerId -> MediaStream

  const localVideoRef = useRef(null);
  const idleTrackingRef = useRef(null);
  const peersRef = useRef({}); // peerId -> RTCPeerConnection
  const localStreamRef = useRef(null); // Ref for handlers to access stream
  const pendingUsersRef = useRef([]); // Users to connect when stream is ready
  const pendingOffersRef = useRef([]); // Offers to process when stream is ready
  const presenceCountRef = useRef(presenceCount);
  const reconnectTimeoutsRef = useRef({}); // peerId -> timeout ID for reconnection attempts
  const connectToPeerRef = useRef(null); // Ref to connectToPeer function
  const handleOfferRef = useRef(null); // Ref to handleOffer function

  // Keep presence count ref updated
  useEffect(() => {
    presenceCountRef.current = presenceCount;
  }, [presenceCount]);

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
      // These will be processed by handlers once functions are defined
      // (handlers check localStreamRef.current and process pending queues)

      setHasPermission(true);

      // Room 1 has NO interaction possible - track idle time with others
      idleTrackingRef.current = setInterval(() => {
        // If there are others in the room, track idle time
        // Room 1 never has interaction, so always count as idle
        if (presenceCountRef.current > 1) {
          onIdleWithOthers(1000);
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
  }, [onIdleWithOthers]);

  // Remove peer connection (defined early to avoid circular dependency)
  const removePeer = useCallback((peerId) => {
    const pc = peersRef.current[peerId];
    if (pc) {
      // Clear any pending reconnection timeouts
      if (reconnectTimeoutsRef.current[peerId]) {
        clearTimeout(reconnectTimeoutsRef.current[peerId]);
        delete reconnectTimeoutsRef.current[peerId];
      }

      // Log connection states before closing
      console.log(`[RTC] Removing peer ${peerId}`, {
        connectionState: pc.connectionState,
        iceConnectionState: pc.iceConnectionState,
        signalingState: pc.signalingState,
      });

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
          console.log(
            `[RTC] ICE candidate from ${peerId}:`,
            event.candidate.candidate.substring(0, 50)
          );
          sendRtcSignal({
            type: "rtc_ice_candidate",
            targetId: peerId,
            candidate: event.candidate,
          });
        } else {
          console.log(`[RTC] ICE gathering complete for ${peerId}`);
        }
      };

      // Handle ICE connection state
      pc.oniceconnectionstatechange = () => {
        const iceState = pc.iceConnectionState;
        const connState = pc.connectionState;
        const iceGathering = pc.iceGatheringState;
        console.log(
          `[RTC] ${peerId} ICE: ${iceState}, Connection: ${connState}, Gathering: ${iceGathering}`
        );

        if (iceState === "failed") {
          console.log(`[RTC] ${peerId} ICE failed, attempting restartIce`);
          try {
            pc.restartIce();
          } catch (err) {
            console.error(`[RTC] Error restarting ICE for ${peerId}:`, err);
          }
        } else if (iceState === "disconnected") {
          console.log(
            `[RTC] ${peerId} ICE disconnected, attempting restartIce`
          );
          try {
            pc.restartIce();
          } catch (err) {
            console.error(`[RTC] Error restarting ICE for ${peerId}:`, err);
          }
        } else if (iceState === "connected" || iceState === "completed") {
          // Clear any pending reconnection timeouts
          if (reconnectTimeoutsRef.current[peerId]) {
            clearTimeout(reconnectTimeoutsRef.current[peerId]);
            delete reconnectTimeoutsRef.current[peerId];
          }
        }
      };

      // Handle remote stream
      pc.ontrack = (event) => {
        console.log(`[RTC] Received track from ${peerId}`, {
          streams: event.streams.length,
          track: event.track.kind,
          id: event.track.id,
        });

        // Create stream from track if streams array is empty
        let remoteStream = event.streams[0];
        if (!remoteStream && event.track) {
          remoteStream = new MediaStream([event.track]);
        }

        if (remoteStream) {
          // Only set if we have video tracks
          const videoTracks = remoteStream.getVideoTracks();
          if (videoTracks.length > 0) {
            setRemoteStreams((prev) => ({
              ...prev,
              [peerId]: remoteStream,
            }));
          }
        }
      };

      // Handle connection state
      pc.onconnectionstatechange = () => {
        const state = pc.connectionState;
        const iceState = pc.iceConnectionState;
        const signalingState = pc.signalingState;
        console.log(
          `[RTC] ${peerId} connection state: ${state}, ICE: ${iceState}, Signaling: ${signalingState}`
        );

        if (state === "closed") {
          // Connection is closed, remove immediately
          removePeer(peerId);
        } else if (state === "failed") {
          // Try to recover with restartIce
          console.log(
            `[RTC] ${peerId} connection failed, attempting restartIce`
          );
          try {
            pc.restartIce();
            // Give it 20 seconds to recover
            if (reconnectTimeoutsRef.current[peerId]) {
              clearTimeout(reconnectTimeoutsRef.current[peerId]);
            }
            reconnectTimeoutsRef.current[peerId] = setTimeout(() => {
              if (peersRef.current[peerId]?.connectionState === "failed") {
                console.log(
                  `[RTC] ${peerId} still failed after recovery attempt, removing`
                );
                removePeer(peerId);
              }
            }, 20000);
          } catch (err) {
            console.error(`[RTC] Error restarting ICE for ${peerId}:`, err);
            removePeer(peerId);
          }
        } else if (state === "disconnected") {
          // Try to recover with restartIce
          console.log(
            `[RTC] ${peerId} connection disconnected, attempting restartIce`
          );
          try {
            pc.restartIce();
            // Give it 30 seconds to reconnect
            if (reconnectTimeoutsRef.current[peerId]) {
              clearTimeout(reconnectTimeoutsRef.current[peerId]);
            }
            reconnectTimeoutsRef.current[peerId] = setTimeout(() => {
              if (
                peersRef.current[peerId]?.connectionState === "disconnected"
              ) {
                console.log(
                  `[RTC] ${peerId} still disconnected after recovery attempt, removing`
                );
                removePeer(peerId);
              }
            }, 30000);
          } catch (err) {
            console.error(`[RTC] Error restarting ICE for ${peerId}:`, err);
          }
        } else if (state === "connected") {
          // Clear any pending reconnection timeouts
          if (reconnectTimeoutsRef.current[peerId]) {
            clearTimeout(reconnectTimeoutsRef.current[peerId]);
            delete reconnectTimeoutsRef.current[peerId];
          }
        }
      };

      peersRef.current[peerId] = pc;
      return pc;
    },
    [sendRtcSignal, removePeer]
  );

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

  // Store connectToPeer in ref and process pending users
  useEffect(() => {
    connectToPeerRef.current = connectToPeer;
    // Process pending users if stream is ready
    if (localStreamRef.current && pendingUsersRef.current.length > 0) {
      console.log(
        "[Room1] Processing pending users after connectToPeer ready:",
        pendingUsersRef.current
      );
      const usersToConnect = [...pendingUsersRef.current];
      pendingUsersRef.current = [];
      usersToConnect.forEach((userId) => {
        connectToPeer(userId, localStreamRef.current);
      });
    }
  }, [connectToPeer]);

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

  // Store handleOffer in ref and process pending offers
  useEffect(() => {
    handleOfferRef.current = handleOffer;
    // Process pending offers if stream is ready
    if (localStreamRef.current && pendingOffersRef.current.length > 0) {
      console.log(
        "[Room1] Processing pending offers after handleOffer ready:",
        pendingOffersRef.current.length
      );
      const offersToProcess = [...pendingOffersRef.current];
      pendingOffersRef.current = [];
      offersToProcess.forEach(({ fromId, offer }) => {
        handleOffer(fromId, offer, localStreamRef.current);
      });
    }
  }, [handleOffer]);

  // Handle incoming answer
  const handleAnswer = useCallback(
    async (fromId, answer) => {
      console.log(`[RTC] Received answer from ${fromId}`);
      const pc = peersRef.current[fromId];
      if (pc) {
        try {
          await pc.setRemoteDescription(new RTCSessionDescription(answer));
        } catch (err) {
          console.error(`[RTC] Error handling answer:`, err);
          // Only remove if it's a critical error
          if (
            err.name === "InvalidStateError" ||
            err.name === "OperationError"
          ) {
            removePeer(fromId);
          }
        }
      }
    },
    [removePeer]
  );

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
    console.log("[Room1] Stopping camera and closing connections");

    // Clear idle tracking interval
    if (idleTrackingRef.current) {
      clearInterval(idleTrackingRef.current);
      idleTrackingRef.current = null;
    }

    // Close all peer connections
    Object.keys(peersRef.current).forEach((peerId) => {
      console.log("[Room1] Closing peer connection:", peerId);
      peersRef.current[peerId].close();
    });
    peersRef.current = {};
    setRemoteStreams({});

    // Clear pending queues
    pendingUsersRef.current = [];
    pendingOffersRef.current = [];

    // Stop local stream using ref (more reliable than state)
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => {
        console.log("[Room1] Stopping track:", track.kind);
        track.stop();
      });
      localStreamRef.current = null;
    }
    setLocalStream(null);

    if (localVideoRef.current) {
      localVideoRef.current.srcObject = null;
    }
  }, []);

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
              // Skip if already connected
              if (peersRef.current[userId]) {
                console.log(`[Room1] Already connected to ${userId}, skipping`);
                return;
              }

              if (localStreamRef.current) {
                // Stream ready, connect now
                connectToPeer(userId, localStreamRef.current);
              } else {
                // Stream not ready, save for later
                console.log("[Room1] Stream not ready, queuing user:", userId);
                if (!pendingUsersRef.current.includes(userId)) {
                  pendingUsersRef.current.push(userId);
                }
              }
            }
          });
        },
        onUserJoined: (userId) => {
          // New user joined - proactively connect if we have stream ready
          console.log(`[Room1] User ${userId} joined`);
          if (localStreamRef.current) {
            // Stream ready, connect now
            connectToPeer(userId, localStreamRef.current);
          } else {
            // Stream not ready, save for later
            console.log(`[Room1] Stream not ready, queuing user:`, userId);
            pendingUsersRef.current.push(userId);
          }
        },
        onUserLeft: (userId) => {
          // Add defensive check: only remove if connection is truly dead
          const pc = peersRef.current[userId];
          if (pc) {
            const connState = pc.connectionState;
            const iceState = pc.iceConnectionState;

            // Don't remove if still connecting or ICE is checking
            if (
              connState === "connecting" ||
              connState === "new" ||
              iceState === "checking" ||
              iceState === "new"
            ) {
              console.log(
                `[RTC] Delaying removal of ${userId} - still connecting (${connState}, ${iceState})`
              );
              // Wait 5 seconds before removing to avoid false positives
              setTimeout(() => {
                if (peersRef.current[userId]) {
                  removePeer(userId);
                }
              }, 5000);
            } else {
              removePeer(userId);
            }
          } else {
            // No peer connection, safe to ignore
            console.log(
              `[RTC] User ${userId} left but no peer connection exists`
            );
          }
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
        {/* <p className="room-note">🔇 Audio is OFF. Video only.</p> */}
      </div>
    </div>
  );
}

// Remote video component
function RemoteVideo({ peerId, stream }) {
  const videoRef = useRef(null);

  // Handle stream changes
  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
      // Explicitly play the video
      videoRef.current.play().catch((err) => {
        console.error(`[RemoteVideo] Error playing video for ${peerId}:`, err);
      });
    } else if (videoRef.current && !stream) {
      // Clear srcObject if stream is removed
      videoRef.current.srcObject = null;
    }
  }, [stream, peerId]);

  // Handle track changes
  useEffect(() => {
    if (!stream || !videoRef.current) return;

    const handleTrackEnded = () => {
      console.log(`[RemoteVideo] Track ended for ${peerId}`);
    };
    const handleTrackMute = () => {
      console.log(`[RemoteVideo] Track muted for ${peerId}`);
    };
    const handleTrackUnmute = () => {
      console.log(`[RemoteVideo] Track unmuted for ${peerId}`);
    };
    const handleTrackAdded = (event) => {
      console.log(`[RemoteVideo] Track added for ${peerId}:`, event.track.kind);
    };
    const handleTrackRemoved = (event) => {
      console.log(
        `[RemoteVideo] Track removed for ${peerId}:`,
        event.track.kind
      );
    };

    const tracks = stream.getTracks();
    tracks.forEach((track) => {
      track.addEventListener("ended", handleTrackEnded);
      track.addEventListener("mute", handleTrackMute);
      track.addEventListener("unmute", handleTrackUnmute);
      track.addEventListener("addtrack", handleTrackAdded);
      track.addEventListener("removetrack", handleTrackRemoved);
    });

    return () => {
      tracks.forEach((track) => {
        track.removeEventListener("ended", handleTrackEnded);
        track.removeEventListener("mute", handleTrackMute);
        track.removeEventListener("unmute", handleTrackUnmute);
        track.removeEventListener("addtrack", handleTrackAdded);
        track.removeEventListener("removetrack", handleTrackRemoved);
      });
    };
  }, [stream, peerId]);

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
