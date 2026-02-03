import { FileText, LayoutDashboard, Layers, Settings, SquareStack } from "lucide-react";
import { NavLink } from "react-router-dom";

const items = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/timeline", label: "Timeline", icon: Layers },
  { to: "/licenses", label: "Licenses", icon: FileText },
  { to: "/courses", label: "Courses", icon: SquareStack },
  { to: "/settings", label: "Settings", icon: Settings },
];

export default function BottomNav() {
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 border-t border-stroke/60 bg-surface/95 px-3 py-2 shadow-lg backdrop-blur sm:hidden">
      <div className="mx-auto flex max-w-md items-center justify-between">
        {items.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              `flex flex-col items-center gap-1 rounded-lg px-3 py-2 text-xs font-semibold transition ${
                isActive ? "bg-ink text-white" : "text-ink/70"
              }`
            }
          >
            <Icon className="h-5 w-5" />
            {label}
          </NavLink>
        ))}
      </div>
    </nav>
  );
}
