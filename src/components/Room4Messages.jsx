/**
 * Room 4: Messages Only
 * Text input with emojis allowed
 * Replies are OPTIONAL (clearly stated)
 * Messages are shared in real-time but NOT stored
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Icon } from "@iconify/react";
import { loadIcon } from "@iconify/react";

const MAX_MESSAGE_LENGTH = 200;
const ICONIFY_SEARCH_LIMIT = 48;

export function Room4Messages({
  participantId,
  presenceCount,
  onMessageSent,
  onIdleWithOthers,
  hasInteracted,
  sendWsMessage,
  incomingMessages,
}) {
  const [input, setInput] = useState("");
  const [isIconOpen, setIsIconOpen] = useState(false);
  const [iconQuery, setIconQuery] = useState("");
  const [iconResults, setIconResults] = useState([]);
  const [iconStatus, setIconStatus] = useState("idle"); // idle | loading | error
  const [iconError, setIconError] = useState("");
  const feedRef = useRef(null);
  const messageSeqRef = useRef(0);
  const idleTrackingRef = useRef(null);
  const presenceCountRef = useRef(presenceCount);
  const hasInteractedRef = useRef(hasInteracted);
  const messages = useMemo(() => incomingMessages || [], [incomingMessages]);

  // Keep refs updated
  useEffect(() => {
    presenceCountRef.current = presenceCount;
  }, [presenceCount]);

  useEffect(() => {
    hasInteractedRef.current = hasInteracted;
  }, [hasInteracted]);

  // Track idle time with others
  useEffect(() => {
    idleTrackingRef.current = setInterval(() => {
      if (presenceCountRef.current > 1 && !hasInteractedRef.current()) {
        onIdleWithOthers(1000);
      }
    }, 1000);

    return () => {
      if (idleTrackingRef.current) {
        clearInterval(idleTrackingRef.current);
      }
    };
  }, [onIdleWithOthers]);

  // Scroll to bottom on new message
  useEffect(() => {
    if (feedRef.current) {
      feedRef.current.scrollTop = feedRef.current.scrollHeight;
    }
  }, [messages]);

  // Handle input change
  const handleInputChange = (e) => {
    setInput(e.target.value.slice(0, MAX_MESSAGE_LENGTH));
  };

  // Send message
  const handleSend = useCallback(() => {
    const text = input.trim();
    if (!text) return;

    messageSeqRef.current += 1;
    const messageId = makeMessageId(participantId, messageSeqRef.current);

    // Record the message (length only for analytics)
    onMessageSent(text.length);

    // Send to server (includes text for broadcasting)
    sendWsMessage(messageId, text);

    setInput("");
  }, [input, participantId, onMessageSent, sendWsMessage]);

  const handleSendIcon = useCallback(
    (iconId) => {
      if (!iconId) return;

      messageSeqRef.current += 1;
      const messageId = makeMessageId(participantId, messageSeqRef.current);

      // Count as a "message" for analytics (length 0)
      onMessageSent(0);

      sendWsMessage(messageId, { kind: "icon", text: "", iconId });
      setIsIconOpen(false);
    },
    [participantId, onMessageSent, sendWsMessage]
  );

  // Handle enter key (check for Korean IME composition)
  const handleKeyDown = (e) => {
    // Skip if composing (Korean/Japanese/Chinese input)
    if (e.nativeEvent.isComposing || e.keyCode === 229) {
      return;
    }

    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const charsRemaining = MAX_MESSAGE_LENGTH - input.length;
  const debouncedIconQuery = useDebouncedValue(iconQuery, 250);

  // Search Iconify when panel opens / query changes
  useEffect(() => {
    if (!isIconOpen) return;
    const q = debouncedIconQuery.trim();

    // When query is short, show defaults
    if (q.length < 2) {
      setIconResults(DEFAULT_ICON_RESULTS);
      setIconStatus("idle");
      setIconError("");
      return;
    }

    const controller = new AbortController();
    async function run() {
      setIconStatus("loading");
      setIconError("");

      try {
        const url = new URL("https://api.iconify.design/search");
        url.searchParams.set("query", q);
        url.searchParams.set("limit", String(ICONIFY_SEARCH_LIMIT));
        url.searchParams.set("start", "0");

        const res = await fetch(url.toString(), { signal: controller.signal });
        if (!res.ok) {
          throw new Error(`Iconify search failed (${res.status})`);
        }
        const data = await res.json();
        const icons = Array.isArray(data?.icons) ? data.icons : [];

        // Normalize into "prefix:name"
        // Iconify search can return either:
        // - strings: ["mdi:home", ...]
        // - objects: [{ prefix: "mdi", name: "home", ... }, ...]
        const names = Array.from(
          new Set(
            icons
              .map((i) => {
                if (typeof i === "string") return i;
                const prefix = i?.prefix;
                const name = i?.name;
                if (typeof prefix === "string" && typeof name === "string") {
                  return `${prefix}:${name}`;
                }
                return null;
              })
              .filter((id) => {
                if (typeof id !== "string") return false;
                const [p, n] = id.split(":");
                return Boolean(p && n);
              })
          )
        );

        // Preload a few icons so thumbnails appear quickly
        await Promise.allSettled(names.slice(0, 18).map((n) => loadIcon(n)));

        setIconResults(names.length ? names : []);
        setIconStatus("idle");
      } catch (e) {
        if (e?.name === "AbortError") return;
        setIconStatus("error");
        setIconError(e?.message || "Failed to search icons");
      }
    }

    run();
    return () => controller.abort();
  }, [isIconOpen, debouncedIconQuery]);

  return (
    <div className="room3-content">
      <div className="messages-feed" ref={feedRef}>
        {messages.length === 0 && (
          <div className="messages-empty">
            <p>Type a message if you want.</p>
            <p className="messages-note">
              <strong>Replies are OPTIONAL.</strong> No pressure to respond.
            </p>
          </div>
        )}

        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`message ${msg.isYou ? "from-you" : "from-other"}`}
          >
            <div className="message-header">
              <span className="message-sender">
                {msg.isYou ? "You" : msg.sender?.slice(0, 8) || "Anonymous"}
              </span>
              <span className="message-time">
                {new Date(msg.timestamp).toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </span>
            </div>
            {msg.kind === "icon" && msg.iconId && (
              <div className="message-icon">
                <Icon icon={msg.iconId} width={48} height={48} />
              </div>
            )}
            {msg.text ? <p className="message-text">{msg.text}</p> : null}
          </div>
        ))}
      </div>

      <div className="messages-input-area">
        <div className="messages-rules">
          <span>Replies optional</span>
          <span>•</span>
          <span>Content not stored</span>
        </div>

        {isIconOpen && (
          <div className="icon-panel">
            <div className="icon-panel-header">
              <div className="icon-panel-title">Search icons</div>
              <input
                className="icon-search"
                value={iconQuery}
                onChange={(e) => setIconQuery(e.target.value)}
                placeholder="Type to search (e.g. bus, camera, heart)..."
              />
              <button
                className="icon-close-btn"
                onClick={() => setIsIconOpen(false)}
                type="button"
              >
                Close
              </button>
            </div>
            <div className="icon-grid">
              {(iconResults.length ? iconResults : DEFAULT_ICON_RESULTS).map(
                (iconId) => (
                  <button
                    key={iconId}
                    className="icon-thumb"
                    onClick={() => handleSendIcon(iconId)}
                    type="button"
                    title={iconId}
                  >
                    <Icon icon={iconId} width={28} height={28} />
                  </button>
                )
              )}
            </div>
            {iconStatus === "loading" ? (
              <div className="icon-panel-hint">Loading…</div>
            ) : null}
            {iconStatus === "error" ? (
              <div className="icon-panel-hint">Error: {iconError}</div>
            ) : null}
          </div>
        )}

        <div className="messages-input-wrapper">
          <textarea
            className="messages-input"
            value={input}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            placeholder="Type something..."
            rows={2}
            maxLength={MAX_MESSAGE_LENGTH}
          />
          <button
            className="messages-icon-btn"
            onClick={() => setIsIconOpen((v) => !v)}
            type="button"
            title="Send pixel icon"
          >
            ICON
          </button>
          <button
            className="messages-send-btn"
            onClick={handleSend}
            disabled={!input.trim()}
          >
            Send
          </button>
        </div>

        <div className="messages-footer">
          <span
            className={`char-count ${charsRemaining < 20 ? "warning" : ""}`}
          >
            {charsRemaining} characters left
          </span>
          <span className="presence-count">
            {presenceCount} {presenceCount === 1 ? "person" : "people"} here
          </span>
        </div>
      </div>
    </div>
  );
}

const DEFAULT_ICON_RESULTS = [
  "mdi:bus",
  "mdi:cart",
  "mdi:shopping",
  "mdi:shopping-outline",
  "mdi:car",
  "mdi:office-building",
  "mdi:camera",
  "mdi:heart",
  "mdi:message",
  "mdi:star",
  "mdi:music",
  "mdi:gamepad-variant",
];

function useDebouncedValue(value, delayMs) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(t);
  }, [value, delayMs]);
  return debounced;
}

function makeMessageId(participantId, seq) {
  // Must remain unique even if the Messages room component remounts.
  // Prefer UUID when available, otherwise fall back to time + seq.
  const uuid = globalThis.crypto?.randomUUID?.();
  if (uuid) return `${participantId}-${uuid}`;
  return `${participantId}-${Date.now()}-${seq}-${Math.random()
    .toString(16)
    .slice(2)}`;
}
