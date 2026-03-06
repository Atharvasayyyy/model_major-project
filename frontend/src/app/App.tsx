import { RouterProvider } from "react-router";
import { router } from "./routes";
import { AuthProvider } from "./context/AuthContext";
import { ChildrenProvider } from "./context/ChildrenContext";
import { SensorDataProvider } from "./context/SensorDataContext";

export default function App() {
  return (
    <div className="dark">
      <AuthProvider>
        <ChildrenProvider>
          <SensorDataProvider>
            <RouterProvider router={router} />
          </SensorDataProvider>
        </ChildrenProvider>
      </AuthProvider>
    </div>
  );
}
