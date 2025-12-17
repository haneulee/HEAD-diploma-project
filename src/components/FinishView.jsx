/**
 * Finish View Component
 * Shows feedback form after session completion
 */

import { postSessionData } from "../hooks/useSession";
import { useState } from "react";

export function FinishView({ session, stats, onRestart }) {
  const [feedback, setFeedback] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);

  const handleFeedbackChange = (e) => {
    setFeedback(e.target.value);
  };

  const handleSubmit = async () => {
    setIsSubmitting(true);

    try {
      // Submit session data with feedback
      await postSessionData(session, feedback.trim(), true);
      setIsSubmitted(true);
    } catch (err) {
      console.error("[FinishView] Failed to submit:", err);
      // Still mark as submitted to allow user to continue
      setIsSubmitted(true);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="finish-view">
      <header className="finish-header">
        <h1>Session Complete</h1>
        <p>Thank you for participating</p>
      </header>

      {!isSubmitted ? (
        <div className="finish-feedback">
          <div className="feedback-form">
            <label htmlFor="feedback-input" className="feedback-label">
              <h3>What did you experience in this test?</h3>
              <p className="feedback-subtitle">
                Please share your thoughts, feelings, or any additional comments
                about your experience.
              </p>
            </label>

            <textarea
              id="feedback-input"
              className="feedback-input"
              value={feedback}
              onChange={handleFeedbackChange}
              placeholder="Type your feedback here..."
              rows={8}
              maxLength={2000}
            />

            <div className="feedback-footer">
              <span className="char-count">
                {feedback.length} / 2000 characters
              </span>
              <div className="feedback-actions">
                <button
                  className="btn-submit-feedback"
                  onClick={handleSubmit}
                  disabled={isSubmitting}
                >
                  {isSubmitting ? "Submitting..." : "Submit"}
                </button>
              </div>
            </div>
          </div>

          <div className="feedback-restart">
            <button className="btn-restart" onClick={onRestart}>
              Start a new session
            </button>
          </div>
        </div>
      ) : (
        <div className="finish-thank-you">
          <div className="thank-you-content">
            <h2>Thank you!</h2>
            <p>Your feedback has been received.</p>
            <button className="btn-restart" onClick={onRestart}>
              Start a new session
            </button>
          </div>
        </div>
      )}

      {!isSubmitted && (
        <p className="finish-note">
          Your feedback is optional but greatly appreciated. No personal
          information is stored.
        </p>
      )}
    </div>
  );
}
