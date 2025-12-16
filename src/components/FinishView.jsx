/**
 * Finish View Component
 * Shows session summary and export options
 */

import { ROOMS } from "../config/zones";
import { useMemo } from "react";

export function FinishView({
  session,
  stats,
  onExportJSON,
  onExportCSV,
  onRestart,
}) {
  // Format duration
  const formatDuration = (ms) => {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;

    if (minutes > 0) {
      return `${minutes}m ${remainingSeconds}s`;
    }
    return `${seconds}s`;
  };

  const formatTotalTime = (ms) => {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);

    if (hours > 0) {
      return `${hours}h ${minutes % 60}m`;
    }
    if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    }
    return `${seconds}s`;
  };

  // Calculate time per room for bars
  const timePerRoom = useMemo(() => {
    return {
      1: stats.timeVideoOnlyMs || 0,
      2: stats.timeAudioOnlyMs || 0,
      4: stats.timeMessagesOnlyMs || 0,
      6: stats.timeDrawingMs || 0,
    };
  }, [stats]);

  const maxTime = useMemo(() => {
    return Math.max(...Object.values(timePerRoom), 1);
  }, [timePerRoom]);

  return (
    <div className="finish-view">
      <header className="finish-header">
        <h1>Session Complete</h1>
        <p>Here's a summary of your participation</p>
      </header>

      <div className="finish-summary">
        <div className="summary-grid">
          <div className="summary-item">
            <p className="summary-label">Participant ID</p>
            <p className="summary-value mono">{session.participantId}</p>
          </div>

          <div className="summary-item">
            <p className="summary-label">Total Time</p>
            <p className="summary-value">
              {formatTotalTime(session.totalTimeMs)}
            </p>
          </div>

          <div className="summary-item">
            <p className="summary-label">First Room</p>
            <p className="summary-value">
              {session.firstRoom ? `Room ${session.firstRoom}` : "—"}
            </p>
          </div>

          <div className="summary-item">
            <p className="summary-label">Room Changes</p>
            <p className="summary-value">{stats.switchesCount}</p>
          </div>

          <div className="summary-item full-width">
            <p className="summary-label">Time in each room</p>
            <div className="room-time-bars">
              {[1, 2, 4, 6].map((roomId) => {
                const time = timePerRoom[roomId];
                const percentage = (time / maxTime) * 100;
                return (
                  <div
                    key={roomId}
                    className="room-time-bar"
                    data-room={roomId}
                  >
                    <span className="room-time-bar-label">
                      {ROOMS[roomId]?.name || `Room ${roomId}`}
                    </span>
                    <div className="room-time-bar-track">
                      <div
                        className="room-time-bar-fill"
                        style={{ width: `${percentage}%` }}
                      />
                    </div>
                    <span className="room-time-bar-value">
                      {time > 0 ? formatDuration(time) : "—"}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Room 1 Metrics */}
          <div className="summary-item">
            <p className="summary-label">Camera On Time</p>
            <p className="summary-value">
              {formatDuration(stats.cameraOnMs || 0)}
            </p>
          </div>

          {/* Room 2 Metrics */}
          <div className="summary-item">
            <p className="summary-label">Mic On Time</p>
            <p className="summary-value">
              {formatDuration(stats.micOnMs || 0)}
            </p>
          </div>

          <div className="summary-item">
            <p className="summary-label">Speaking Events</p>
            <p className="summary-value">{stats.speakingEvents || 0}</p>
          </div>

          <div className="summary-item">
            <p className="summary-label">Speaking Time</p>
            <p className="summary-value">
              {formatDuration(stats.speakingMs || 0)}
            </p>
          </div>

          {/* Room 4 Metrics */}
          <div className="summary-item">
            <p className="summary-label">Messages Sent</p>
            <p className="summary-value">{stats.messagesSent || 0}</p>
          </div>

          <div className="summary-item">
            <p className="summary-label">Avg Message Length</p>
            <p className="summary-value">{stats.avgMessageLength || 0} chars</p>
          </div>

          {/* Room 6 Metrics */}
          <div className="summary-item">
            <p className="summary-label">Drawing Strokes</p>
            <p className="summary-value">{stats.strokesCount || 0}</p>
          </div>

          <div className="summary-item">
            <p className="summary-label">Path</p>
            <p className="summary-value mono" style={{ fontSize: "0.8rem" }}>
              {stats.roomSequence || "—"}
            </p>
          </div>
        </div>
      </div>

      <div className="finish-actions">
        <button className="btn-export" onClick={onExportJSON}>
          Download JSON
        </button>
        <button className="btn-export" onClick={onExportCSV}>
          Download CSV
        </button>
      </div>

      <button className="btn-restart" onClick={onRestart}>
        Start a new session
      </button>

      <p className="finish-note">
        Your data has been automatically saved. No personal information is
        stored.
      </p>

      <details className="debug-section">
        <summary>Debug: Full session data</summary>
        <pre>{JSON.stringify({ session, stats }, null, 2)}</pre>
      </details>
    </div>
  );
}
