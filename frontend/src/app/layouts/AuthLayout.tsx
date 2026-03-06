import { Outlet, Navigate } from "react-router";
import { useAuth } from "../context/AuthContext";
import { Activity } from "lucide-react";

export const AuthLayout = () => {
  const { isAuthenticated } = useAuth();

  if (isAuthenticated) {
    return <Navigate to="/app" replace />;
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-purple-900 via-blue-900 to-indigo-900 p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="flex items-center justify-center gap-2 mb-4">
            <Activity className="w-10 h-10 text-purple-400" />
            <h1 className="text-3xl font-bold text-white">MindPulse</h1>
          </div>
          <p className="text-gray-300">AI-powered Student Engagement Monitoring</p>
        </div>
        <Outlet />
      </div>
    </div>
  );
};
