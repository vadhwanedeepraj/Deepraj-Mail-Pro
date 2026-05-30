import React from "react";

export const Card = ({ children, className = "", glow = false }) => (
  <div className={`bg-white rounded-2xl border border-gray-100 shadow-sm hover:shadow-md transition-all duration-300 p-6 ${glow ? 'ring-2 ring-blue-100 shadow-blue-50' : ''} ${className}`}>
    {children}
  </div>
);
