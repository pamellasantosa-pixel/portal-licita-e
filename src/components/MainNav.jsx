import { NavLink } from "react-router-dom";

const items = [
  { to: "/dashboard", label: "Dashboard" },
  { to: "/bids", label: "Explorar Editais" },
  { to: "/documents", label: "Documentos" },
  { to: "/calendar", label: "Calendario" },
  { to: "/settings", label: "Configuracoes" }
];

export default function MainNav() {
  return (
    <nav className="rounded-2xl border border-brand-brown/10 bg-white p-3 shadow-panel">
      <ul className="flex flex-wrap gap-2">
        {items.map((item) => (
          <li key={item.to}>
            <NavLink
              to={item.to}
              className={({ isActive }) =>
                [
                  "inline-flex rounded-lg px-3 py-2 font-body text-sm transition",
                  isActive ? "bg-brand-cyan text-white" : "bg-brand-sand/60 text-brand-brown hover:bg-brand-sand"
                ].join(" ")
              }
            >
              {item.label}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}
