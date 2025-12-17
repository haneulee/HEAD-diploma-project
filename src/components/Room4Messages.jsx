/**
 * Room 4: Messages Only
 * Text input with emojis allowed
 * Replies are OPTIONAL (clearly stated)
 * Messages are shared in real-time but NOT stored
 */

import { useCallback, useEffect, useRef, useState } from "react";

const MAX_MESSAGE_LENGTH = 200;

export function Room4Messages({
  participantId,
  presenceCount,
  onMessageSent,
  onIdleWithOthers,
  hasInteracted,
  sendWsMessage,
  incomingMessages,
  clearMessages,
}) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const feedRef = useRef(null);
  const messageIdRef = useRef(0);
  const idleTrackingRef = useRef(null);
  const presenceCountRef = useRef(presenceCount);
  const hasInteractedRef = useRef(hasInteracted);

  // Track processed message IDs to avoid duplicates
  const processedIdsRef = useRef(new Set());

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

  // Merge incoming messages with local messages
  useEffect(() => {
    if (incomingMessages && incomingMessages.length > 0) {
      const newMessages = incomingMessages.filter(
        (m) => !processedIdsRef.current.has(m.id)
      );

      if (newMessages.length > 0) {
        newMessages.forEach((m) => processedIdsRef.current.add(m.id));
        setMessages((prev) => [...prev, ...newMessages]);
      }
    }
  }, [incomingMessages]);

  // Scroll to bottom on new message
  useEffect(() => {
    if (feedRef.current) {
      feedRef.current.scrollTop = feedRef.current.scrollHeight;
    }
  }, [messages]);

  // Clear messages on unmount
  useEffect(() => {
    return () => {
      if (clearMessages) {
        clearMessages();
      }
    };
  }, [clearMessages]);

  // Handle input change
  const handleInputChange = (e) => {
    setInput(e.target.value.slice(0, MAX_MESSAGE_LENGTH));
  };

  // Send message
  const handleSend = useCallback(() => {
    const text = input.trim();
    if (!text) return;

    messageIdRef.current += 1;
    const messageId = `${participantId}-${messageIdRef.current}`;

    // Add to local messages immediately
    const newMessage = {
      id: messageId,
      text,
      sender: participantId,
      isYou: true,
      timestamp: Date.now(),
    };
    setMessages((prev) => [...prev, newMessage]);

    // Record the message (length only for analytics)
    onMessageSent(text.length);

    // Send to server (includes text for broadcasting)
    sendWsMessage(messageId, text);

    setInput("");
  }, [input, participantId, onMessageSent, sendWsMessage]);

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
            <p className="message-text">{msg.text}</p>
          </div>
        ))}
      </div>

      <div className="messages-input-area">
        <div className="messages-rules">
          <span>Replies optional</span>
          <span>•</span>
          <span>Content not stored</span>
        </div>

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
