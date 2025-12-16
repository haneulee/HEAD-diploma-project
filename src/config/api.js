/**
 * API Configuration
 * Configure endpoints for data collection
 */

// WebSocket server URL
export const WS_URL = import.meta.env.VITE_WS_URL || "ws://localhost:3001";

// Google Apps Script endpoint for data collection
// Deploy your Apps Script as a web app and paste the URL here
export const DATA_ENDPOINT = import.meta.env.VITE_DATA_ENDPOINT || "";

// How often to auto-save session data (ms) - 0 to disable
export const AUTO_SAVE_INTERVAL = 60000; // 1 minute
