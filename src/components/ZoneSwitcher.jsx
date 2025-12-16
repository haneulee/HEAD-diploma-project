/**
 * Room Switcher Modal
 * Allows users to move between rooms with permission gates
 */

import { ROOMS, roomRequiresPermission } from "../config/zones";
import { useCallback, useState } from "react";

export function RoomSwitcher({
  isOpen,
  onClose,
  onSwitch,
  currentRoom,
  presenceCounts,
}) {
  const [permissionError, setPermissionError] = useState(null);
  const [checkingPermission, setCheckingPermission] = useState(null);

  const handleSwitch = useCallback(
    async (roomId) => {
      if (roomId === currentRoom) return;

      const permission = roomRequiresPermission(roomId);

      if (!permission) {
        onSwitch(roomId);
        return;
      }

      // Need to check permission
      setCheckingPermission(roomId);
      setPermissionError(null);

      try {
        const constraints = {
          video: permission === "camera" ? { facingMode: "user" } : false,
          audio: permission === "microphone" ? true : false,
        };

        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        stream.getTracks().forEach((track) => track.stop());

        setCheckingPermission(null);
        onSwitch(roomId);
      } catch (err) {
        console.error("Permission error:", err);
        setCheckingPermission(null);
        setPermissionError({
          roomId,
          message:
            err.name === "NotAllowedError"
              ? `${
                  permission === "camera" ? "Camera" : "Microphone"
                } permission required.`
              : `Cannot access ${
                  permission === "camera" ? "camera" : "microphone"
                }.`,
        });
      }
    },
    [currentRoom, onSwitch]
  );

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Change Room</h3>
          <button className="modal-close" onClick={onClose}>
            ×
          </button>
        </div>

        <div className="room-switcher-options">
          {Object.values(ROOMS).map((room) => {
            const isCurrent = room.id === currentRoom;
            const isChecking = checkingPermission === room.id;
            const hasError = permissionError?.roomId === room.id;
            const requiresPermission = roomRequiresPermission(room.id);

            return (
              <button
                key={room.id}
                className={`room-switch-btn ${isCurrent ? "is-current" : ""} ${
                  hasError ? "has-error" : ""
                }`}
                data-room={room.id}
                onClick={() => handleSwitch(room.id)}
                disabled={isCurrent || isChecking}
              >
                <span className="room-switch-icon">{room.icon}</span>
                <div className="room-switch-info">
                  <h4>
                    Room {room.id}: {room.name}
                    {isCurrent && <span className="current-badge">(here)</span>}
                  </h4>
                  <p className="room-switch-presence">
                    {presenceCounts[room.id] || 0}{" "}
                    {(presenceCounts[room.id] || 0) === 1 ? "person" : "people"}
                    {requiresPermission && (
                      <span className="permission-badge">
                        {requiresPermission === "camera" ? "📹" : "🎤"}
                      </span>
                    )}
                  </p>
                  {hasError && (
                    <p className="room-switch-error">
                      {permissionError.message}
                    </p>
                  )}
                </div>
                {isChecking && <span className="loading-spinner small" />}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
