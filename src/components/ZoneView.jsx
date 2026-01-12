/**
 * Room View Component
 * Renders the appropriate room screen based on current room
 */

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
  onSpeakingEvent,
  onMessageSent,
  onStroke,
  onIdleWithOthers,
  hasInteracted,
  // WebSocket callbacks
  sendWsMessage,
  incomingMessages,
  drawingStrokes,
  sendStroke,
  clearDrawing,
}) {
  const room = ROOMS[roomId];

  // Safety check for invalid room ID
  if (!room) {
    return <div className="room-view">Invalid room. Please restart.</div>;
  }

  return (
    <div className="room-view" data-room={roomId}>
      <header className="room-header">
        <div className="room-header-top">
          <div className="room-title">
            {/* <span className="room-badge">Room {roomId}</span> */}
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
        </div>
      </header>

      <div className="room-content">
        {roomId === 1 && (
          <Room1VideoOnly
            participantId={participantId}
            presenceCount={presenceCount}
            onIdleWithOthers={onIdleWithOthers}
          />
        )}

        {roomId === 2 && (
          <Room2AudioOnly
            participantId={participantId}
            presenceCount={presenceCount}
            onSpeakingEvent={onSpeakingEvent}
            onIdleWithOthers={onIdleWithOthers}
            hasInteracted={hasInteracted}
          />
        )}

        {roomId === 3 && (
          <Room4Messages
            participantId={participantId}
            presenceCount={presenceCount}
            onMessageSent={onMessageSent}
            onIdleWithOthers={onIdleWithOthers}
            hasInteracted={hasInteracted}
            sendWsMessage={sendWsMessage}
            incomingMessages={incomingMessages}
          />
        )}

        {roomId === 4 && (
          <Room6Drawing
            participantId={participantId}
            presenceCount={presenceCount}
            drawingStrokes={drawingStrokes}
            onStroke={onStroke}
            onIdleWithOthers={onIdleWithOthers}
            hasInteracted={hasInteracted}
            sendStroke={sendStroke}
            clearDrawing={clearDrawing}
          />
        )}
      </div>
    </div>
  );
}
