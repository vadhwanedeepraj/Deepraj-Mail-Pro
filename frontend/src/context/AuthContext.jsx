import React, { createContext, useContext, useState, useCallback } from "react";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [token, setToken] = useState(() => localStorage.getItem("edp_token"));
  const [userEmail, setUserEmail] = useState(() => localStorage.getItem("edp_user"));
  const [userRole, setUserRole] = useState(() => localStorage.getItem("edp_role"));

  const login = useCallback((newToken, email, role) => {
    localStorage.setItem("edp_token", newToken);
    localStorage.setItem("edp_user", email);
    localStorage.setItem("edp_role", role);
    setToken(newToken);
    setUserEmail(email);
    setUserRole(role);
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem("edp_token");
    localStorage.removeItem("edp_user");
    localStorage.removeItem("edp_role");
    setToken(null);
    setUserEmail(null);
    setUserRole(null);
  }, []);

  const value = {
    token,
    userEmail,
    userRole,
    login,
    logout,
    isAuthenticated: !!token,
    isAdmin: userRole === "admin"
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
