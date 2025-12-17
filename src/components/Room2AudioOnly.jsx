/**
 * Room 2: Audio Only (LiveKit)
 * Microphone REQUIRED, no video
 * Uses LiveKit for audio streaming + Web Audio API for speaking detection
 */

import { Room, RoomEvent, Track, createLocalAudioTrack } from "livekit-client";
import { useCallback, useEffect, useRef, useState } from "react";

import { API_URL } from "../config/api";
import { LIVEKIT_URL } from "../config/livekit";

const VOLUME_THRESHOLD = 0.02;
const SPEECH_DEBOUNCE_MS = 200;

export function Room2AudioOnly({
  participantId,
  presenceCount,
  onSpeakingEvent,
  onIdleWithOthers,
  hasInteracted,
}) {
  const [hasPermission, setHasPermission] = useState(null);
  const [error, setError] = useState(null);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [volume, setVolume] = useState(0);
  const [remoteParticipants, setRemoteParticipants] = useState([]);
  const [isConnecting, setIsConnecting] = useState(false);

  const roomRef = useRef(null);
  const audioContextRef = useRef(null);
  const analyserRef = useRef(null);
  const animationFrameRef = useRef(null);
  const localAudioTrackRef = useRef(null);

  const idleTrackingRef = useRef(null);
  const speakingStartRef = useRef(null);
  const speechTimeoutRef = useRef(null);

  const presenceCountRef = useRef(presenceCount);
  const hasInteractedRef = useRef(hasInteracted);
  const onSpeakingEventRef = useRef(onSpeakingEvent);

  // Keep refs updated
  useEffect(() => {
    presenceCountRef.current = presenceCount;
  }, [presenceCount]);

  useEffect(() => {
    hasInteractedRef.current = hasInteracted;
  }, [hasInteracted]);

  useEffect(() => {
    onSpeakingEventRef.current = onSpeakingEvent;
  }, [onSpeakingEvent]);

  // Update remote participants list
  const updateParticipants = useCallback(() => {
    if (roomRef.current) {
      const participants = Array.from(
        roomRef.current.remoteParticipants.values()
      );
      setRemoteParticipants(participants);
    }
  }, []);

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
          }, SPEECH_DEBOUNCE_MS);
        }
      }

      animationFrameRef.current = requestAnimationFrame(analyze);
    };

    analyze();
  }, []);

  // Connect to LiveKit room
  const connectToRoom = useCallback(async () => {
    if (isConnecting || roomRef.current?.state === "connected") {
      return;
    }

    setIsConnecting(true);

    try {
      // First get device list to find Bluetooth headphones
      await navigator.mediaDevices.getUserMedia({ audio: true });
      const devices = await navigator.mediaDevices.enumerateDevices();
      const audioInputs = devices.filter((d) => d.kind === "audioinput");

      console.log(
        "[LiveKit] Available audio devices:",
        audioInputs.map((d) => d.label)
      );

      // Find Bluetooth device if available
      let preferredDeviceId = undefined;
      const bluetoothDevice = audioInputs.find((d) => {
        const label = d.label.toLowerCase();
        return (
          (label.includes("bluetooth") ||
            label.includes("airpods") ||
            label.includes("headphone") ||
            label.includes("headset")) &&
          !label.includes("built-in")
        );
      });

      if (bluetoothDevice) {
        preferredDeviceId = bluetoothDevice.deviceId;
        console.log("[LiveKit] Using Bluetooth device:", bluetoothDevice.label);
      }

      // Create local audio track
      const audioTrack = await createLocalAudioTrack({
        deviceId: preferredDeviceId,
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      });

      localAudioTrackRef.current = audioTrack;
      setHasPermission(true);

      // Set up audio analysis for speaking detection
      const stream = new MediaStream([audioTrack.mediaStreamTrack]);
      audioContextRef.current = new AudioContext();
      const source = audioContextRef.current.createMediaStreamSource(stream);
      analyserRef.current = audioContextRef.current.createAnalyser();
      analyserRef.current.fftSize = 256;
      source.connect(analyserRef.current);
      startAnalyzing();

      // Get token from server
      const tokenResponse = await fetch(
        `${API_URL}/livekit/token?room=audio-room&identity=${participantId}`
      );

      if (!tokenResponse.ok) {
        throw new Error("Failed to get LiveKit token");
      }

      const { token } = await tokenResponse.json();

      // Create and connect to room
      const room = new Room({
        adaptiveStream: true,
        dynacast: true,
      });

      roomRef.current = room;

      // Set up event handlers
      room.on(RoomEvent.TrackSubscribed, (track, publication, participant) => {
        console.log(
          `[LiveKit] Track subscribed: ${track.kind} from ${participant.identity}`
        );

        // Auto-play audio tracks
        if (track.kind === Track.Kind.Audio) {
          const audioElement = track.attach();
          audioElement.play().catch(console.error);
        }

        updateParticipants();
      });

      room.on(
        RoomEvent.TrackUnsubscribed,
        (track, publication, participant) => {
          console.log(
            `[LiveKit] Track unsubscribed: ${track.kind} from ${participant.identity}`
          );
          track.detach();
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

      // Publish local audio track (no video)
      await room.localParticipant.publishTrack(audioTrack, {
        name: "microphone",
      });

      updateParticipants();

      // Start idle tracking
      idleTrackingRef.current = setInterval(() => {
        // If there are others in the room and user hasn't interacted, count as idle
        if (presenceCountRef.current > 1 && !hasInteractedRef.current) {
          onIdleWithOthers(1000);
        }
      }, 1000);
    } catch (err) {
      console.error("[LiveKit] Connection error:", err);
      setHasPermission(false);
      setError(
        err.name === "NotAllowedError"
          ? "Microphone permission denied. Please allow microphone access to enter this room."
          : err.message || "Could not connect to audio room. Please try again."
      );
    } finally {
      setIsConnecting(false);
    }
  }, [
    participantId,
    onIdleWithOthers,
    updateParticipants,
    startAnalyzing,
    isConnecting,
  ]);

  // Disconnect and cleanup
  const disconnect = useCallback(() => {
    console.log("[LiveKit] Disconnecting...");

    if (idleTrackingRef.current) {
      clearInterval(idleTrackingRef.current);
      idleTrackingRef.current = null;
    }

    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }

    if (speechTimeoutRef.current) {
      clearTimeout(speechTimeoutRef.current);
      speechTimeoutRef.current = null;
    }

    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }

    if (localAudioTrackRef.current) {
      localAudioTrackRef.current.stop();
      localAudioTrackRef.current = null;
    }

    if (roomRef.current) {
      roomRef.current.disconnect();
      roomRef.current = null;
    }

    setRemoteParticipants([]);
  }, []);

  // Connect on mount
  useEffect(() => {
    connectToRoom();

    return () => {
      disconnect();
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
            : "Requesting microphone access..."}
        </p>
      </div>
    );
  }

  return (
    <div className="room2-content">
      {/* Local audio visualization */}
      <div className="audio-visualization">
        <div className={`speaker-indicator ${isSpeaking ? "speaking" : ""}`}>
          <div className="speaker-icon">🎤</div>
          <div className="volume-bars">
            {[...Array(10)].map((_, i) => (
              <div
                key={i}
                className={`volume-bar ${volume > i * 0.1 ? "active" : ""}`}
              />
            ))}
          </div>
        </div>
        <p className="speaking-status">
          {isSpeaking ? "Speaking..." : "Listening..."}
        </p>
      </div>

      {/* Remote participants */}
      <div className="remote-speakers">
        <h4>
          {remoteParticipants.length > 0
            ? `${remoteParticipants.length} other${
                remoteParticipants.length > 1 ? "s" : ""
              } in room`
            : "Waiting for others..."}
        </h4>
        <div className="speaker-list">
          {remoteParticipants.map((participant) => (
            <RemoteParticipantAudio
              key={participant.identity}
              participant={participant}
            />
          ))}
        </div>
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

// Remote participant audio component
function RemoteParticipantAudio({ participant }) {
  const [isSpeaking, setIsSpeaking] = useState(false);

  useEffect(() => {
    // Listen for speaking state changes
    const handleIsSpeakingChanged = (speaking) => {
      setIsSpeaking(speaking);
    };

    participant.on("isSpeakingChanged", handleIsSpeakingChanged);

    return () => {
      participant.off("isSpeakingChanged", handleIsSpeakingChanged);
    };
  }, [participant]);

  return (
    <div className={`remote-speaker ${isSpeaking ? "speaking" : ""}`}>
      <div className="speaker-avatar">🔊</div>
      <span className="speaker-id">{participant.identity.slice(0, 8)}</span>
      {isSpeaking && <span className="speaking-dot" />}
    </div>
  );
}
