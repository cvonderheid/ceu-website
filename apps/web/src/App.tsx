import { useEffect, useState } from "react";
import { Navigate, Route, Routes } from "react-router-dom";

import AppShell from "@/components/AppShell";
import { beginLogin, getValidAccessToken, isAuthConfigured } from "@/lib/auth";
import AuthCallback from "@/pages/AuthCallback";
import Courses from "@/pages/Courses";
import Dashboard from "@/pages/Dashboard";
import Licenses from "@/pages/Licenses";
import Settings from "@/pages/Settings";
import Timeline from "@/pages/Timeline";

function RequireAuth({ children }: { children: JSX.Element }) {
  const [ready, setReady] = useState(!isAuthConfigured());

  useEffect(() => {
    let active = true;

    const run = async () => {
      if (!isAuthConfigured()) {
        if (active) {
          setReady(true);
        }
        return;
      }

      const token = await getValidAccessToken();
      if (token) {
        if (active) {
          setReady(true);
        }
        return;
      }

      const returnTo = `${window.location.pathname}${window.location.search}${window.location.hash}`;
      await beginLogin(returnTo);
    };

    void run();

    return () => {
      active = false;
    };
  }, []);

  if (!ready) {
    return <div className="p-6 text-sm text-ink/70">Redirecting to sign in...</div>;
  }

  return children;
}

export default function App() {
  return (
    <Routes>
      <Route path="/auth/callback" element={<AuthCallback />} />
      <Route
        element={
          <RequireAuth>
            <AppShell />
          </RequireAuth>
        }
      >
        <Route index element={<Navigate to="/dashboard" replace />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/timeline" element={<Timeline />} />
        <Route path="/licenses" element={<Licenses />} />
        <Route path="/courses" element={<Courses />} />
        <Route path="/settings" element={<Settings />} />
      </Route>
    </Routes>
  );
}
