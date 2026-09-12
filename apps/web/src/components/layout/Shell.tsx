import { Inbox, Search, Users, Cable, Settings, Plus } from "lucide-react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { clsx } from "clsx";
import { useSession } from "../../stores/session";
import { Avatar } from "../ui/primitives";
import { CommandPalette } from "../search/CommandPalette";

const rail = [
  { to: "/", icon: Inbox, label: "Inbox" },
  { to: "/contacts", icon: Users, label: "Contacts" },
  { to: "/settings/connections", icon: Cable, label: "Connections" },
  { to: "/settings", icon: Settings, label: "Settings" },
];

export function Shell() {
  const user = useSession((s) => s.user);
  const nav = useNavigate();
  const [search, setSearch] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setSearch(true);
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "n") {
        e.preventDefault();
        setSearch(true);
      }
      if (e.key === "Escape") setSearch(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="flex h-full bg-ink-900">
      <nav className="flex w-[68px] shrink-0 flex-col items-center border-r border-white/5 py-4" aria-label="Main">
        <NavLink to="/" className="mb-6 text-accent" aria-label="Impro">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-accent text-accent-fg font-semibold">i</span>
        </NavLink>
        {rail.map((r) => (
          <NavLink
            key={r.to}
            to={r.to}
            end={r.to === "/"}
            title={r.label}
            className={({ isActive }) =>
              clsx(
                "mb-1 grid h-10 w-10 place-items-center rounded-xl text-mist-500 hover:bg-white/5 hover:text-white",
                isActive && "bg-white/10 text-white",
              )
            }
          >
            <r.icon size={18} />
          </NavLink>
        ))}
        <button
          className="mt-2 grid h-10 w-10 place-items-center rounded-xl text-mist-500 hover:bg-white/5 hover:text-white"
          title="Search"
          onClick={() => setSearch(true)}
        >
          <Search size={18} />
        </button>
        <button
          className="mt-auto grid h-10 w-10 place-items-center rounded-xl text-mist-500 hover:bg-white/5"
          title="New conversation"
          onClick={() => setSearch(true)}
        >
          <Plus size={18} />
        </button>
        <button className="mt-2" onClick={() => nav("/settings")} title={user?.displayName}>
          <Avatar name={user?.displayName || "You"} src={user?.avatarUrl} size={32} />
        </button>
      </nav>
      <div className="min-w-0 flex-1">
        <Outlet />
      </div>
      <CommandPalette open={search} onClose={() => setSearch(false)} />
    </div>
  );
}
