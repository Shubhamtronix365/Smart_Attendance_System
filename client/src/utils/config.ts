/**
 * Application Runtime Configuration & Endpoints
 * Automatically normalizes backend REST and WebSocket endpoints
 */

const rawApiUrl = process.env.NEXT_PUBLIC_API_URL || "https://smart-attendance-backend-tzp4.onrender.com";
export const API_BASE_URL = rawApiUrl.replace(
  "smart-attendance-system-x6wv.onrender.com",
  "smart-attendance-backend-tzp4.onrender.com"
);

const rawWsUrl = process.env.NEXT_PUBLIC_WS_URL || "";
export const WS_BASE_URL = (() => {
  if (rawWsUrl) {
    return rawWsUrl.replace(
      "smart-attendance-system-x6wv.onrender.com",
      "smart-attendance-backend-tzp4.onrender.com"
    );
  }
  const apiBase = API_BASE_URL.replace(/^http/, "ws");
  return `${apiBase.replace(/\/api\/?$/, "")}/ws/client`;
})();

export const getWsUrl = (): string => WS_BASE_URL;
