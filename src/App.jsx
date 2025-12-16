/**
 * Research Prototype - Main App Component
 * Multi-room study for observing user behavior under communication constraints
 */

import "./App.css";

import { useCallback, useEffect, useState } from "react";

import { FinishView } from "./components/FinishView";
import { Lobby } from "./components/Lobby";
import { RoomSwitcher } from "./components/ZoneSwitcher";
import { RoomView } from "./components/ZoneView";
import { useSession } from "./hooks/useSession";
import { useWebSocket } from "./hooks/useWebSocket";

// App views
const VIEW = {
  LOBBY: "lobby",
  ROOM: "room",
  FINISH: "finish",
};

function App() {
  // Session management
  const {
    session,
    enterRoom,
    leaveRoom,
    recordCameraTime,
    recordMicTime,
    recordSpeakingEvent,
    recordMessageSent,
    recordStroke,
    recordDrawingTime,
    finishSession,
    resetSession,
    getStats,
    exportJSON,
    exportCSV,
  } = useSession();

  // WebSocket connection
  const {
    isConnected,
    presenceCounts,
    incomingMessages,
    drawingStrokes,
    joinRoom: wsJoinRoom,
    leaveRoom: wsLeaveRoom,
    sendMessage: wsSendMessage,
    sendRtcSignal,
    sendStroke: wsSendStroke,
    clearDrawing: wsClearDrawing,
    clearMessages: wsClearMessages,
    registerHandlers,
    getPresenceCount,
  } = useWebSocket(session.participantId);

  // Current view state
  const [currentView, setCurrentView] = useState(() => {
    if (session.completed) return VIEW.FINISH;
    if (session.currentRoom !== null) return VIEW.ROOM;
    return VIEW.LOBBY;
  });

  const [isSwitcherOpen, setIsSwitcherOpen] = useState(false);

  // Sync WebSocket room with session room on mount/reconnect
  useEffect(() => {
    if (isConnected && session.currentRoom !== null) {
      wsJoinRoom(session.currentRoom);
    }
  }, [isConnected, session.currentRoom, wsJoinRoom]);

  // Handle entering a room from lobby
  const handleEnterRoom = useCallback(
    (roomId) => {
      enterRoom(roomId);
      wsJoinRoom(roomId);
      setCurrentView(VIEW.ROOM);
    },
    [enterRoom, wsJoinRoom]
  );

  // Handle switching rooms
  const handleSwitchRoom = useCallback(
    (roomId) => {
      leaveRoom();
      wsLeaveRoom();
      enterRoom(roomId);
      wsJoinRoom(roomId);
      setIsSwitcherOpen(false);
    },
    [leaveRoom, wsLeaveRoom, enterRoom, wsJoinRoom]
  );

  // Handle finishing the session
  const handleFinish = useCallback(() => {
    leaveRoom();
    wsLeaveRoom();
    finishSession();
    setCurrentView(VIEW.FINISH);
  }, [leaveRoom, wsLeaveRoom, finishSession]);

  // Handle restarting
  const handleRestart = useCallback(() => {
    resetSession();
    setCurrentView(VIEW.LOBBY);
  }, [resetSession]);

  // Get presence count for current room (server already includes self)
  const currentRoomPresence =
    session.currentRoom !== null ? getPresenceCount(session.currentRoom) : 0;

  return (
    <div className="app">
      <div className="app-container">
        {currentView === VIEW.LOBBY && (
          <Lobby
            onEnterRoom={handleEnterRoom}
            participantId={session.participantId}
            presenceCounts={presenceCounts}
            isConnected={isConnected}
          />
        )}

        {currentView === VIEW.ROOM && session.currentRoom !== null && (
          <>
            <RoomView
              roomId={session.currentRoom}
              onOpenSwitcher={() => setIsSwitcherOpen(true)}
              onFinish={handleFinish}
              presenceCount={currentRoomPresence}
              participantId={session.participantId}
              // Session callbacks
              onCameraTime={recordCameraTime}
              onMicTime={recordMicTime}
              onSpeakingEvent={recordSpeakingEvent}
              onMessageSent={recordMessageSent}
              onStroke={recordStroke}
              onDrawingTime={recordDrawingTime}
              // WebSocket data & callbacks
              sendWsMessage={wsSendMessage}
              sendRtcSignal={sendRtcSignal}
              registerHandlers={registerHandlers}
              incomingMessages={incomingMessages}
              clearMessages={wsClearMessages}
              drawingStrokes={drawingStrokes}
              sendStroke={wsSendStroke}
              clearDrawing={wsClearDrawing}
            />
            <RoomSwitcher
              isOpen={isSwitcherOpen}
              onClose={() => setIsSwitcherOpen(false)}
              onSwitch={handleSwitchRoom}
              currentRoom={session.currentRoom}
              presenceCounts={presenceCounts}
            />
          </>
        )}

        {currentView === VIEW.FINISH && (
          <FinishView
            session={session}
            stats={getStats()}
            onExportJSON={exportJSON}
            onExportCSV={exportCSV}
            onRestart={handleRestart}
          />
        )}
      </div>
    </div>
  );
}

export default App;
