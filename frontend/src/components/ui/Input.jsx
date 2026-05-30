import React from "react";

export const Input = ({ label, ...props }) => (
  <div className="space-y-1.5">
    {label && <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider">{label}</label>}
    <input className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 bg-white text-gray-900 text-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 transition-all" {...props} />
  </div>
);

export const Textarea = ({ label, ...props }) => (
  <div className="space-y-1.5">
    {label && <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider">{label}</label>}
    <textarea className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 bg-white text-gray-900 text-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 transition-all resize-none" {...props} />
  </div>
);

export const Select = ({ label, options, ...props }) => (
  <div className="space-y-1.5">
    {label && <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider">{label}</label>}
    <select className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 bg-white text-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 transition-all" {...props}>
      <option value="">— None —</option>
      {options.map((o) => <option key={o} value={o}>{o}</option>)}
    </select>
  </div>
);
