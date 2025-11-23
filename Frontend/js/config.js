(function initConfigHelpers() {
  if (window.getApiBaseUrl) {
    return;
  }

  const stripTrailingSlash = value =>
    typeof value === "string" ? value.replace(/\/$/, "") : value;

  const FALLBACK_BASE_URL = "http://localhost:3000";

  window.getApiBaseUrl = function getApiBaseUrl() {
    const configuredBase = window.__CONFIG?.apiBaseUrl;
    if (typeof configuredBase === "string" && configuredBase.trim()) {
      return stripTrailingSlash(configuredBase.trim());
    }

    const locationOrigin = window?.location?.origin;
    if (typeof locationOrigin === "string" && locationOrigin !== "null") {
      return stripTrailingSlash(locationOrigin);
    }

    return FALLBACK_BASE_URL;
  };
})();
