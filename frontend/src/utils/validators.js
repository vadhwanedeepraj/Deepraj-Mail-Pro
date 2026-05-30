/**
 * Common frontend validation and rendering utilities.
 */

export const validateEmail = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(e).trim());

export const renderTemplate = (tpl, vars) =>
  (tpl || "").replace(/\{\{\s*(\w+)\s*\}\}/g, (_, k) => vars[k] ?? "");

export const sanitizeColumns = (cols) =>
  cols.map((c) => String(c).replace(/\W+/g, "_").replace(/^_+|_+$/g, ""));
