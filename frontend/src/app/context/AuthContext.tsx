import React, { createContext, useContext, useState, ReactNode } from "react";
import { api } from "../services/api";

const viteEnv = (import.meta as any).env as Record<string, string> | undefined;
const DEV_AUTO_LOGIN = viteEnv?.VITE_DEV_AUTO_LOGIN === "true";

const DEV_USER: User = {
  id: "DEV-U001",
  name: "Demo Parent",
  email: "demo@mindpulse.local",
};

interface User {
  id: string;
  name: string;
  email: string;
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  login: (email: string, password: string) => Promise<void>;
  register: (name: string, email: string, password: string) => Promise<void>;
  logout: () => void;
  isAuthenticated: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(() => {
    const savedUser = localStorage.getItem("mindpulse_user");
    if (savedUser) {
      return JSON.parse(savedUser);
    }
    return DEV_AUTO_LOGIN ? DEV_USER : null;
  });
  const [token, setToken] = useState<string | null>(() => {
    const savedToken = localStorage.getItem("mindpulse_token");
    if (savedToken) {
      return savedToken;
    }
    return DEV_AUTO_LOGIN ? "dev-token" : null;
  });

  const login = async (email: string, password: string) => {
    const { user: loggedInUser, token: authToken } = await api.login(email, password);
    setUser(loggedInUser);
    setToken(authToken);
    localStorage.setItem("mindpulse_user", JSON.stringify(loggedInUser));
    if (authToken) {
      localStorage.setItem("mindpulse_token", authToken);
    }
  };

  const register = async (name: string, email: string, password: string) => {
    const { user: registeredUser, token: authToken } = await api.register(name, email, password);
    setUser(registeredUser);
    setToken(authToken);
    localStorage.setItem("mindpulse_user", JSON.stringify(registeredUser));
    if (authToken) {
      localStorage.setItem("mindpulse_token", authToken);
    }
  };

  const logout = () => {
    setUser(null);
    setToken(null);
    localStorage.removeItem("mindpulse_user");
    localStorage.removeItem("mindpulse_token");
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        login,
        register,
        logout,
        isAuthenticated: !!user,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};
