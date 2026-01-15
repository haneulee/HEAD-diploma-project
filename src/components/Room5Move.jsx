/**
 * Room 5: Move
 * Ambient co-presence via cursor / touch visualization.
 *
 * - Desktop: mouse cursor position is broadcast.
 * - Mobile: touch position becomes a soft dot; on release it fades out.
 * - No names/IDs shown; only subtle color differences.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

const SEND_FPS = 30;

function clamp01(n) {
  return Math.max(0, Math.min(1, n));
}

function colorFromId(id) {
  // Deterministic, subtle color per participant
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = (hash * 31 + id.charCodeAt(i)) | 0;
  }
  const hue = Math.abs(hash) % 360;
  return `hsla(${hue}, 60%, 70%, 0.55)`;
}

export function Room5Move({ participantId, cursorStates, sendCursor }) {
  const stageRef = useRef(null);
  const lastSentRef = useRef(0);
  const rafRef = useRef(null);
  const pendingPayloadRef = useRef(null);
  const sendCursorRef = useRef(sendCursor);

  useEffect(() => {
    sendCursorRef.current = sendCursor;
  }, [sendCursor]);

  const [local, setLocal] = useState(null); // {x,y,active,pointerType,ts}

  const sendThrottled = useCallback((payload) => {
    const now = Date.now();
    const minInterval = 1000 / SEND_FPS;
    if (now - lastSentRef.current < minInterval) {
      pendingPayloadRef.current = payload;
      if (!rafRef.current) {
        rafRef.current = requestAnimationFrame(() => {
          rafRef.current = null;
          const p = pendingPayloadRef.current;
          if (p) {
            pendingPayloadRef.current = null;
            // Re-run using the latest sendCursor ref
            const now2 = Date.now();
            lastSentRef.current = now2;
            sendCursorRef.current(p);
          }
        });
      }
      return;
    }
    lastSentRef.current = now;
    sendCursorRef.current(payload);
  }, []);

  const remoteMarkers = useMemo(() => {
    const entries = Object.entries(cursorStates || {});
    return entries
      .map(([id, s]) => {
        if (!s) return null;
        return {
          id,
          x: s.x,
          y: s.y,
          color: colorFromId(id),
        };
      })
      .filter(Boolean);
  }, [cursorStates]);

  const toNormalized = useCallback((clientX, clientY) => {
    const el = stageRef.current;
    if (!el) return null;
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height) return null;
    return {
      x: clamp01((clientX - r.left) / r.width),
      y: clamp01((clientY - r.top) / r.height),
    };
  }, []);

  const handlePointerMove = useCallback(
    (e) => {
      const p = toNormalized(e.clientX, e.clientY);
      if (!p) return;
      const payload = {
        x: p.x,
        y: p.y,
        active: true,
        pointerType: e.pointerType || "mouse",
      };
      setLocal({ ...payload, ts: Date.now() });
      sendThrottled(payload);
    },
    [toNormalized, sendThrottled]
  );

  const handlePointerDown = useCallback(
    (e) => {
      const p = toNormalized(e.clientX, e.clientY);
      if (!p) return;
      const payload = {
        x: p.x,
        y: p.y,
        active: true,
        pointerType: e.pointerType || "touch",
      };
      setLocal({ ...payload, ts: Date.now() });
      sendThrottled(payload);
    },
    [toNormalized, sendThrottled]
  );

  const handlePointerUpOrLeave = useCallback(
    (e) => {
      const p = toNormalized(e.clientX, e.clientY) || local;
      if (!p) return;
      const payload = {
        x: p.x,
        y: p.y,
        active: true,
        pointerType: e.pointerType || "touch",
      };
      setLocal({ ...payload, ts: Date.now() });
      sendThrottled(payload);
    },
    [toNormalized, sendThrottled, local]
  );

  const localColor = useMemo(
    () => (participantId ? colorFromId(participantId) : "hsla(0,0%,100%,0.45)"),
    [participantId]
  );

  return (
    <div className="move-room">
      <div className="move-stage" ref={stageRef}>
        <div
          className="move-hit"
          onPointerMove={handlePointerMove}
          onPointerDown={handlePointerDown}
          onPointerUp={handlePointerUpOrLeave}
          onPointerCancel={handlePointerUpOrLeave}
          onPointerLeave={handlePointerUpOrLeave}
        />

        {remoteMarkers.map((s) => (
          <div
            key={s.id}
            className="move-marker active"
            style={{
              left: `${s.x * 100}%`,
              top: `${s.y * 100}%`,
              background: s.color,
              opacity: 0.55,
            }}
            aria-hidden="true"
          />
        ))}

        {local?.x != null && local?.y != null && (
          <div
            className="move-marker self active"
            style={{
              left: `${local.x * 100}%`,
              top: `${local.y * 100}%`,
              background: localColor,
              opacity: 0.35,
            }}
            aria-hidden="true"
          />
        )}
      </div>
    </div>
  );
}
