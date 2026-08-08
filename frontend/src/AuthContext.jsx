import { createContext, useContext, useState, useCallback } from "react";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [token, setToken] = useState(() => localStorage.getItem("pnwp_token"));
  const [user, setUser] = useState(() => {
    const raw = localStorage.getItem("pnwp_user");
    return raw ? JSON.parse(raw) : null;
  });

  const login = useCallback((t, u) => {
    setToken(t);
    setUser(u);
    localStorage.setItem("pnwp_token", t);
    localStorage.setItem("pnwp_user", JSON.stringify(u));
  }, []);

  const logout = useCallback(() => {
    setToken(null);
    setUser(null);
    localStorage.removeItem("pnwp_token");
    localStorage.removeItem("pnwp_user");
  }, []);

  return (
    <AuthContext.Provider value={{ token, user, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
