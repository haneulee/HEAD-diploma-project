/**
 * Lobby Component
 * Shows 4 room cards with rules and real-time presence counts
 * Handles permission gates before entering Room 1 (camera) and Room 2 (mic)
 */

import { ROOMS, roomRequiresPermission } from "../config/zones";
import { useCallback, useState } from "react";

export function Lobby({
  onEnterRoom,
  participantId,
  presenceCounts,
  isConnected,
}) {
  const [permissionModal, setPermissionModal] = useState(null);
  const [permissionError, setPermissionError] = useState(null);

  // Check permission before entering a room
  const handleRoomClick = useCallback(
    async (roomId) => {
      const permission = roomRequiresPermission(roomId);

      if (!permission) {
        // No permission needed, enter directly
        onEnterRoom(roomId);
        return;
      }

      // Show permission modal
      setPermissionModal({ roomId, permission });
      setPermissionError(null);
    },
    [onEnterRoom]
  );

  // Request permission and enter room
  const handlePermissionGrant = useCallback(async () => {
    if (!permissionModal) return;

    const { roomId, permission } = permissionModal;

    try {
      const constraints = {
        video: permission === "camera" ? { facingMode: "user" } : false,
        audio: permission === "microphone" ? true : false,
      };

      // Request permission
      const stream = await navigator.mediaDevices.getUserMedia(constraints);

      // Stop the stream immediately - we just needed to check permission
      stream.getTracks().forEach((track) => track.stop());

      // Permission granted, enter room
      setPermissionModal(null);
      onEnterRoom(roomId);
    } catch (err) {
      console.error("Permission error:", err);
      setPermissionError(
        err.name === "NotAllowedError"
          ? `${
              permission === "camera" ? "Camera" : "Microphone"
            } permission denied. Please allow access to enter this room.`
          : `Could not access ${
              permission === "camera" ? "camera" : "microphone"
            }. Please check your device settings.`
      );
    }
  }, [permissionModal, onEnterRoom]);

  // Cancel permission request
  const handlePermissionCancel = useCallback(() => {
    setPermissionModal(null);
    setPermissionError(null);
  }, []);

  return (
    <div className="lobby">
      <header className="lobby-header">
        <h1>Choose a Room</h1>
        <p>
          Each room has different rules for interaction. Pick one to start. You
          can switch rooms anytime.
        </p>
        <div className="lobby-meta">
          <span className="lobby-id">ID: {participantId}</span>
          <span
            className={`connection-status ${
              isConnected ? "connected" : "disconnected"
            }`}
          >
            {isConnected ? "● Connected" : "○ Connecting..."}
          </span>
        </div>
      </header>

      <div className="room-cards">
        {Object.values(ROOMS).map((room) => (
          <RoomCard
            key={room.id}
            room={room}
            presenceCount={presenceCounts[room.id] || 0}
            onClick={() => handleRoomClick(room.id)}
          />
        ))}
      </div>

      {/* Permission Modal */}
      {permissionModal && (
        <div className="modal-overlay" onClick={handlePermissionCancel}>
          <div
            className="modal permission-modal"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-header">
              <h3>Permission Required</h3>
              <button className="modal-close" onClick={handlePermissionCancel}>
                ×
              </button>
            </div>

            <div className="permission-content">
              <div className="permission-icon">
                {permissionModal.permission === "camera" ? "📹" : "🎤"}
              </div>

              <p className="permission-text">
                <strong>
                  Room {permissionModal.roomId}:{" "}
                  {ROOMS[permissionModal.roomId].name}
                </strong>
                <br />
                requires{" "}
                {permissionModal.permission === "camera"
                  ? "camera"
                  : "microphone"}{" "}
                access.
              </p>

              <ul className="permission-rules">
                {permissionModal.permission === "camera" ? (
                  <>
                    <li>Your camera will be ON</li>
                    <li>Microphone is always OFF</li>
                    <li>Only you can see your preview</li>
                    <li>No video is stored or shared</li>
                  </>
                ) : (
                  <>
                    <li>Your microphone will be ON</li>
                    <li>Camera is never used</li>
                    <li>No audio is stored</li>
                    <li>Only speaking detection is logged</li>
                  </>
                )}
              </ul>

              {permissionError && (
                <p className="permission-error">{permissionError}</p>
              )}

              <div className="permission-actions">
                <button className="btn-cancel" onClick={handlePermissionCancel}>
                  Cancel
                </button>
                <button className="btn-grant" onClick={handlePermissionGrant}>
                  Allow & Enter
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function RoomCard({ room, presenceCount, onClick }) {
  const requiresPermission = roomRequiresPermission(room.id);

  return (
    <button className="room-card" data-room={room.id} onClick={onClick}>
      <div className="room-card-header">
        <span className="room-card-number">Room {room.id}</span>
        {requiresPermission && (
          <span className="room-card-permission">
            {requiresPermission === "camera" ? "📹" : "🎤"} Required
          </span>
        )}
      </div>

      <div className="room-card-icon">{room.icon}</div>
      <h3>{room.name}</h3>
      <p className="room-card-desc">{room.shortDesc}</p>

      <div className="room-card-rules">{room.rules}</div>

      <div className="room-card-footer">
        <div className="room-card-presence">
          <span className="presence-dot" />
          <span>
            {presenceCount} {presenceCount === 1 ? "person" : "people"} here
          </span>
        </div>
        <span className="room-card-enter">Enter →</span>
      </div>
    </button>
  );
}
