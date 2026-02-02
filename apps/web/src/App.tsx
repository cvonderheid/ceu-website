import { Navigate, Route, Routes } from "react-router-dom";

import AppShell from "@/components/AppShell";
import Courses from "@/pages/Courses";
import Dashboard from "@/pages/Dashboard";
import Settings from "@/pages/Settings";
import Timeline from "@/pages/Timeline";

export default function App() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<Navigate to="/dashboard" replace />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/timeline" element={<Timeline />} />
        <Route path="/courses" element={<Courses />} />
        <Route path="/settings" element={<Settings />} />
      </Route>
    </Routes>
  );
}
