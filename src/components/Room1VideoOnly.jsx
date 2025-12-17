/**
 * Room 1: Video Only (LiveKit)
 * Camera REQUIRED, microphone always OFF
 * Shows local preview + remote peer videos
 */

import {
  Room,
  RoomEvent,
  Track,
  VideoPresets,
  createLocalVideoTrack,
} from "livekit-client";
import { useCallback, useEffect, useRef, useState } from "react";

import { API_URL } from "../config/api";
import { LIVEKIT_URL } from "../config/livekit";

export function Room1VideoOnly({
  participantId,
  presenceCount,
  onIdleWithOthers,
}) {
  const [hasPermission, setHasPermission] = useState(null);
  const [error, setError] = useState(null);
  const [localVideoTrack, setLocalVideoTrack] = useState(null);
  const [remoteParticipants, setRemoteParticipants] = useState([]);
  const [isConnecting, setIsConnecting] = useState(false);

  const roomRef = useRef(null);
  const localVideoRef = useRef(null);
  const idleTrackingRef = useRef(null);
  const presenceCountRef = useRef(presenceCount);

  // Keep presence count ref updated
  useEffect(() => {
    presenceCountRef.current = presenceCount;
  }, [presenceCount]);

  // Update remote participants list
  const updateParticipants = useCallback(() => {
    if (roomRef.current) {
      const participants = Array.from(
        roomRef.current.remoteParticipants.values()
      );
      setRemoteParticipants(participants);
    }
  }, []);

  // Connect to LiveKit room
  const connectToRoom = useCallback(async () => {
    if (isConnecting || roomRef.current?.state === "connected") {
      return;
    }

    setIsConnecting(true);

    try {
      // Create local video track first (to get permission)
      const videoTrack = await createLocalVideoTrack({
        resolution: VideoPresets.h720.resolution,
        facingMode: "user",
      });

      setLocalVideoTrack(videoTrack);
      setHasPermission(true);

      // Attach to local video element
      if (localVideoRef.current) {
        videoTrack.attach(localVideoRef.current);
      }

      // Get token from server
      const tokenResponse = await fetch(
        `${API_URL}/livekit/token?room=video-room&identity=${participantId}`
      );

      if (!tokenResponse.ok) {
        throw new Error("Failed to get LiveKit token");
      }

      const { token } = await tokenResponse.json();

      // Create and connect to room
      const room = new Room({
        adaptiveStream: true,
        dynacast: true,
        videoCaptureDefaults: {
          resolution: VideoPresets.h720.resolution,
        },
      });

      roomRef.current = room;

      // Set up event handlers
      room.on(RoomEvent.TrackSubscribed, (track, publication, participant) => {
        console.log(
          `[LiveKit] Track subscribed: ${track.kind} from ${participant.identity}`
        );
        updateParticipants();
      });

      room.on(
        RoomEvent.TrackUnsubscribed,
        (track, publication, participant) => {
          console.log(
            `[LiveKit] Track unsubscribed: ${track.kind} from ${participant.identity}`
          );
          updateParticipants();
        }
      );

      room.on(RoomEvent.ParticipantConnected, (participant) => {
        console.log(`[LiveKit] Participant connected: ${participant.identity}`);
        updateParticipants();
      });

      room.on(RoomEvent.ParticipantDisconnected, (participant) => {
        console.log(
          `[LiveKit] Participant disconnected: ${participant.identity}`
        );
        updateParticipants();
      });

      room.on(RoomEvent.Disconnected, () => {
        console.log("[LiveKit] Disconnected from room");
        setRemoteParticipants([]);
      });

      room.on(RoomEvent.Reconnecting, () => {
        console.log("[LiveKit] Reconnecting...");
      });

      room.on(RoomEvent.Reconnected, () => {
        console.log("[LiveKit] Reconnected!");
        updateParticipants();
      });

      // Connect to room
      await room.connect(LIVEKIT_URL, token);
      console.log("[LiveKit] Connected to room:", room.name);

      // Publish local video track (no audio)
      await room.localParticipant.publishTrack(videoTrack, {
        name: "camera",
        simulcast: true,
      });

      updateParticipants();

      // Start idle tracking (Room 1 has no interaction, always idle)
      idleTrackingRef.current = setInterval(() => {
        if (presenceCountRef.current > 1) {
          onIdleWithOthers(1000);
        }
      }, 1000);
    } catch (err) {
      console.error("[LiveKit] Connection error:", err);
      setHasPermission(false);
      setError(
        err.name === "NotAllowedError"
          ? "Camera permission denied. Please allow camera access to enter this room."
          : err.message || "Could not connect to video room. Please try again."
      );
    } finally {
      setIsConnecting(false);
    }
  }, [participantId, onIdleWithOthers, updateParticipants, isConnecting]);

  // Disconnect and cleanup
  const disconnect = useCallback(() => {
    console.log("[LiveKit] Disconnecting...");

    if (idleTrackingRef.current) {
      clearInterval(idleTrackingRef.current);
      idleTrackingRef.current = null;
    }

    if (localVideoTrack) {
      localVideoTrack.stop();
      setLocalVideoTrack(null);
    }

    if (roomRef.current) {
      roomRef.current.disconnect();
      roomRef.current = null;
    }

    setRemoteParticipants([]);
  }, [localVideoTrack]);

  // Connect on mount
  useEffect(() => {
    connectToRoom();

    return () => {
      disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Attach local video when track changes
  useEffect(() => {
    if (localVideoRef.current && localVideoTrack) {
      localVideoTrack.attach(localVideoRef.current);
    }
  }, [localVideoTrack]);

  // Permission denied view
  if (hasPermission === false) {
    return (
      <div className="room-permission-denied">
        <div className="permission-icon">📹</div>
        <h3>Camera Required</h3>
        <p>{error}</p>
        <button className="btn-retry" onClick={connectToRoom}>
          Try Again
        </button>
      </div>
    );
  }

  // Loading view
  if (hasPermission === null || isConnecting) {
    return (
      <div className="room-loading">
        <div className="loading-spinner" />
        <p>
          {isConnecting
            ? "Connecting to room..."
            : "Requesting camera access..."}
        </p>
      </div>
    );
  }

  const totalVideos = 1 + remoteParticipants.length;

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
        {remoteParticipants.map((participant) => (
          <RemoteParticipantVideo
            key={participant.identity}
            participant={participant}
          />
        ))}
      </div>

      <div className="room-info">
        <div className="presence-indicator">
          <span className="presence-dot active" />
          <span>
            {1 + remoteParticipants.length}{" "}
            {1 + remoteParticipants.length === 1 ? "person" : "people"} in room
          </span>
        </div>
      </div>
    </div>
  );
}

// Remote participant video component
function RemoteParticipantVideo({ participant }) {
  const videoRef = useRef(null);
  const [videoTrack, setVideoTrack] = useState(null);

  useEffect(() => {
    // Find video track from participant (use timeout to avoid sync setState in effect)
    const trackPublication = participant.getTrackPublication(
      Track.Source.Camera
    );

    if (trackPublication?.track) {
      // Defer setState to avoid cascading renders
      const track = trackPublication.track;
      queueMicrotask(() => setVideoTrack(track));
    }

    // Listen for track changes
    const handleTrackSubscribed = (track) => {
      if (track.kind === Track.Kind.Video) {
        setVideoTrack(track);
      }
    };

    const handleTrackUnsubscribed = (track) => {
      if (track.kind === Track.Kind.Video) {
        setVideoTrack(null);
      }
    };

    participant.on("trackSubscribed", handleTrackSubscribed);
    participant.on("trackUnsubscribed", handleTrackUnsubscribed);

    return () => {
      participant.off("trackSubscribed", handleTrackSubscribed);
      participant.off("trackUnsubscribed", handleTrackUnsubscribed);
    };
  }, [participant]);

  useEffect(() => {
    if (videoRef.current && videoTrack) {
      videoTrack.attach(videoRef.current);
    }

    return () => {
      if (videoTrack) {
        videoTrack.detach();
      }
    };
  }, [videoTrack]);

  return (
    <div className="video-container remote">
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted={false}
        className="video-element"
      />
      <div className="video-label">{participant.identity.slice(0, 8)}</div>
    </div>
  );
}
