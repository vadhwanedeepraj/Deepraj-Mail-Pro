import React from "react";
import { useAuth } from "../../context/AuthContext";

export function TopBar({ title }) {
  const { userRole } = useAuth();

  return (
    <div className="bg-white/80 backdrop-blur-sm border-b border-gray-100 px-8 py-4 flex items-center justify-between sticky top-0 z-40">
      <div>
        <h2 className="text-lg font-bold text-gray-900">{title}</h2>
        <p className="text-xs text-gray-400 mt-0.5">Deepraj Mail Pro &mdash; by Deepraj Technologies</p>
      </div>
      <div className="flex items-center gap-3">
        <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold ${
          userRole === 'admin' ? 'bg-violet-100 text-violet-700' : 'bg-blue-100 text-blue-700'
        }`}>
          <span className="w-1.5 h-1.5 rounded-full bg-current"></span>
          {userRole === 'admin' ? 'Administrator' : 'Client'}
        </span>
      </div>
    </div>
  );
}
export default TopBar;
