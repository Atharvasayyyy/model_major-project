import React, { createContext, useContext, useState, ReactNode } from "react";
import { api } from "../services/api";

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

const getAuthErrorMessage = (error: unknown, fallback: string) => {
  const maybeError = error as {
    response?: { data?: { message?: string; error?: string } };
    message?: string;
  };

  if (maybeError?.response?.data?.message) {
    return maybeError.response.data.message;
  }

  if (maybeError?.response?.data?.error) {
    return maybeError.response.data.error;
  }

  if (maybeError?.message === "Network Error") {
    return "Backend API is unreachable. Start backend and MongoDB, then try again.";
  }

  return maybeError?.message || fallback;
};

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(() => {
    const savedUser = localStorage.getItem("mindpulse_user");
    const savedToken = localStorage.getItem("mindpulse_token");
    if (savedUser && !savedToken) {
      localStorage.removeItem("mindpulse_user");
      return null;
    }
    if (savedUser) {
      return JSON.parse(savedUser);
    }
    return null;
  });
  const [token, setToken] = useState<string | null>(() => {
    const savedToken = localStorage.getItem("mindpulse_token");
    if (savedToken) {
      return savedToken;
    }
    return null;
  });

  const login = async (email: string, password: string) => {
    try {
      const { user: loggedInUser, token: authToken } = await api.loginUser({ email, password });
      if (!authToken) {
        throw new Error("Login failed: token not received from backend");
      }
      setUser(loggedInUser);
      setToken(authToken);
      localStorage.setItem("mindpulse_user", JSON.stringify(loggedInUser));
      localStorage.setItem("mindpulse_token", authToken);
    } catch (error) {
      throw new Error(getAuthErrorMessage(error, "Login failed"));
    }
  };

  const register = async (name: string, email: string, password: string) => {
    try {
      await api.registerUser({ name, email, password });
    } catch (error) {
      throw new Error(getAuthErrorMessage(error, "Registration failed"));
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
        isAuthenticated: !!user && !!token,
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
