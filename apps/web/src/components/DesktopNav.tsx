import { LayoutDashboard, Layers, Settings, SquareStack } from "lucide-react";
import { NavLink } from "react-router-dom";

const items = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/timeline", label: "Timeline", icon: Layers },
  { to: "/courses", label: "Courses", icon: SquareStack },
  { to: "/settings", label: "Settings", icon: Settings },
];

export default function DesktopNav() {
  return (
    <aside className="sticky top-6 hidden h-fit w-52 flex-col gap-3 rounded-2xl border border-stroke/60 bg-surface/80 p-4 shadow-sm sm:flex">
      <div className="text-sm font-semibold uppercase tracking-[0.2em] text-ink/50">CE Tracker</div>
      <nav className="flex flex-col gap-2">
        {items.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              `flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-semibold transition ${
                isActive ? "bg-ink text-white" : "text-ink/70 hover:bg-ink/5"
              }`
            }
          >
            <Icon className="h-4 w-4" />
            {label}
          </NavLink>
        ))}
      </nav>
    </aside>
  );
}
