import { createBrowserRouter } from "react-router";
import { RootLayout } from "./layouts/RootLayout";
import { AuthLayout } from "./layouts/AuthLayout";
import { DashboardLayout } from "./layouts/DashboardLayout";
import { Login } from "./pages/Login";
import { Register } from "./pages/Register";
import { Dashboard } from "./pages/Dashboard";
import { Children } from "./pages/Children";
import { Monitoring } from "./pages/Monitoring";
import { Analytics } from "./pages/Analytics";
import { Reports } from "./pages/Reports";
import { Alerts } from "./pages/Alerts";
import { NotFound } from "./pages/NotFound";

export const router = createBrowserRouter([
  {
    path: "/",
    Component: RootLayout,
    children: [
      {
        path: "auth",
        Component: AuthLayout,
        children: [
          { path: "login", Component: Login },
          { path: "register", Component: Register },
        ],
      },
      {
        path: "/",
        Component: DashboardLayout,
        children: [
          { index: true, Component: Dashboard },
          { path: "children", Component: Children },
          { path: "monitoring", Component: Monitoring },
          { path: "analytics", Component: Analytics },
          { path: "reports", Component: Reports },
          { path: "alerts", Component: Alerts },
        ],
      },
      { path: "*", Component: NotFound },
    ],
  },
]);
