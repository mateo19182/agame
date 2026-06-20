import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { createBrowserRouter, RouterProvider } from "react-router-dom";
import "./index.css";
import { RequireAuth } from "./components/RequireAuth";
import Landing from "./routes/Landing";
import Login from "./routes/Login";
import Host from "./routes/Host";
import Play from "./routes/Play";
import Settings from "./routes/Settings";

const router = createBrowserRouter([
  { path: "/login", element: <Login /> },
  {
    element: <RequireAuth />,
    children: [
      { path: "/", element: <Landing /> },
      { path: "/host/:code", element: <Host /> },
      { path: "/play/:code", element: <Play /> },
      { path: "/settings", element: <Settings /> },
    ],
  },
]);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>
);
