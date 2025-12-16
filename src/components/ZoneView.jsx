/**
 * Room View Component
 * Renders the appropriate room screen based on current room
 */

import { useEffect, useState } from "react";

import { ROOMS } from "../config/zones";
import { Room1VideoOnly } from "./Room1VideoOnly";
import { Room2AudioOnly } from "./Room2AudioOnly";
import { Room4Messages } from "./Room4Messages";
import { Room6Drawing } from "./Room6Drawing";

export function RoomView({
  roomId,
  onOpenSwitcher,
  onFinish,
  presenceCount,
  participantId,
  // Session callbacks
  onCameraTime,
  onMicTime,
  onSpeakingEvent,
  onMessageSent,
  onStroke,
  onDrawingTime,
  // WebSocket callbacks
  sendWsMessage,
  sendRtcSignal,
  registerHandlers,
  incomingMessages,
  clearMessages,
  drawingStrokes,
  sendStroke,
  clearDrawing,
}) {
  const room = ROOMS[roomId];

  return (
    <div className="room-view" data-room={roomId}>
      <header className="room-header">
        <div className="room-header-top">
          <div className="room-title">
            <span className="room-badge">Room {roomId}</span>
            <h2>{room.name}</h2>
          </div>
          <div className="room-header-actions">
            <button className="btn-move" onClick={onOpenSwitcher}>
              Change Room
            </button>
            <button className="btn-finish" onClick={onFinish}>
              Finish
            </button>
          </div>
        </div>
        <div className="room-header-meta">
          <div className="room-presence">
            <span className="presence-dot" />
            <span>{presenceCount} here</span>
          </div>
          <div className="room-timer">
            <Timer key={roomId} />
          </div>
        </div>
      </header>

      <div className="room-content">
        {roomId === 1 && (
          <Room1VideoOnly
            participantId={participantId}
            presenceCount={presenceCount}
            onCameraTime={onCameraTime}
            sendRtcSignal={sendRtcSignal}
            registerHandlers={registerHandlers}
          />
        )}

        {roomId === 2 && (
          <Room2AudioOnly
            participantId={participantId}
            presenceCount={presenceCount}
            onMicTime={onMicTime}
            onSpeakingEvent={onSpeakingEvent}
            sendRtcSignal={sendRtcSignal}
            registerHandlers={registerHandlers}
          />
        )}

        {roomId === 4 && (
          <Room4Messages
            participantId={participantId}
            presenceCount={presenceCount}
            onMessageSent={onMessageSent}
            sendWsMessage={sendWsMessage}
            incomingMessages={incomingMessages}
            clearMessages={clearMessages}
          />
        )}

        {roomId === 6 && (
          <Room6Drawing
            participantId={participantId}
            presenceCount={presenceCount}
            drawingStrokes={drawingStrokes}
            onStroke={onStroke}
            onDrawingTime={onDrawingTime}
            sendStroke={sendStroke}
            clearDrawing={clearDrawing}
          />
        )}
      </div>
    </div>
  );
}

// Timer component - resets on room change via key prop
function Timer() {
  const [seconds, setSeconds] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setSeconds((prev) => prev + 1);
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  const formatted = `${mins.toString().padStart(2, "0")}:${secs
    .toString()
    .padStart(2, "0")}`;

  return <span>⏱ {formatted}</span>;
}
