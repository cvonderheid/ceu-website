import { Outlet } from "react-router-dom";

import BottomNav from "@/components/BottomNav";
import DesktopNav from "@/components/DesktopNav";

export default function AppShell() {
  return (
    <div className="app-shell min-h-screen">
      <div className="mx-auto flex w-full max-w-6xl gap-6 px-4 pb-24 pt-6 sm:px-6 sm:pb-6">
        <DesktopNav />
        <main className="w-full">
          <Outlet />
        </main>
      </div>
      <BottomNav />
    </div>
  );
}
