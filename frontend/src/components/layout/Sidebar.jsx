import React from "react";
import { useAuth } from "../../context/AuthContext";
import { Icon } from "../ui/Icon";

function SidebarItem({ icon, label, active, onClick, badge }) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 group ${
        active
          ? "bg-gradient-to-r from-blue-600 to-violet-600 text-white shadow-md shadow-blue-200/50"
          : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
      }`}
    >
      <Icon name={icon} size={16} className={active ? "text-white" : "text-gray-400 group-hover:text-gray-600"} />
      <span className="flex-1 text-left">{label}</span>
      {badge && <span className={`text-xs font-bold px-1.5 py-0.5 rounded-full ${active ? 'bg-white/20 text-white' : 'bg-blue-100 text-blue-600'}`}>{badge}</span>}
    </button>
  );
}

export function Sidebar({ currentTab, setTab, steps }) {
  const { userEmail, userRole, logout } = useAuth();

  return (
    <aside className="w-64 min-h-screen bg-white border-r border-gray-100 shadow-sm flex flex-col sticky top-0 h-screen overflow-y-auto">
      {/* Logo */}
      <div className="p-5 border-b border-gray-100">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-600 to-violet-600 flex items-center justify-center shadow-md flex-shrink-0">
            <Icon name="mail" size={16} className="text-white" />
          </div>
          <div>
            <h1 className="text-sm font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-blue-700 to-violet-700 leading-none">Deepraj Mail Pro</h1>
            <p className="text-xs text-gray-400 font-medium mt-0.5">by Deepraj Technologies</p>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-3 space-y-1">
        {steps.map(step => (
          <SidebarItem
            key={step.id}
            icon={step.icon}
            label={step.label}
            active={currentTab === step.id}
            onClick={() => setTab(step.id)}
          />
        ))}
      </nav>

      {/* User Footer */}
      <div className="p-3 border-t border-gray-100">
        <div className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl bg-gray-50 mb-2">
          <div className="w-7 h-7 rounded-full bg-gradient-to-br from-blue-500 to-violet-500 flex items-center justify-center flex-shrink-0">
            <span className="text-white text-xs font-bold">{userEmail?.[0]?.toUpperCase() || 'U'}</span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold text-gray-800 truncate">{userEmail}</p>
            <p className="text-xs text-gray-400 capitalize">{userRole || 'client'}</p>
          </div>
        </div>
        <button onClick={logout} className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium text-red-500 hover:bg-red-50 transition-colors">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
            <polyline points="16 17 21 12 16 7"/>
            <line x1="21" y1="12" x2="9" y2="12"/>
          </svg>
          Sign Out
        </button>
      </div>
    </aside>
  );
}
export default Sidebar;
