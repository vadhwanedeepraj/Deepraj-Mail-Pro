import { useAuth } from "../context/AuthContext";
import { useCallback } from "react";

export function useApi() {
  const { token, logout } = useAuth();

  const request = useCallback(async (url, options = {}) => {
    const headers = { ...options.headers };

    // Automatically attach Bearer auth token
    if (token && !headers["Authorization"]) {
      headers["Authorization"] = `Bearer ${token}`;
    }

    // Set JSON content-type if not sending FormData and not already set
    if (!(options.body instanceof FormData) && !headers["Content-Type"]) {
      headers["Content-Type"] = "application/json";
    }

    try {
      const response = await fetch(url, { ...options, headers });

      // Globally handle 401 / 403 credentials expire
      if (response.status === 401 || response.status === 403) {
        logout();
        let errorMsg = "Session expired — please log in again";
        try {
          const json = await response.json();
          if (json.message) errorMsg = json.message;
        } catch (_) {}
        throw new Error(errorMsg);
      }

      const json = await response.json();

      if (!response.ok || json.success === false) {
        throw new Error(json.message || `Request failed with status ${response.status}`);
      }

      return json;
    } catch (err) {
      throw err;
    }
  }, [token, logout]);

  return { request };
}
export default useApi;
