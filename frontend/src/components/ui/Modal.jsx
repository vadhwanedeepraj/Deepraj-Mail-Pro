import React, { useEffect, useRef } from "react";
import { Button } from "./Button";
import { Input } from "./Input";
import { Icon } from "./Icon";

/**
 * Base modal wrapper layout that handles animations, key listeners, accessibility, and focus trapping.
 */
function ModalBase({ isOpen, onClose, title, children }) {
  const modalRef = useRef(null);

  // Close on Escape key press
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === "Escape") onClose();
    };

    if (isOpen) {
      document.addEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "hidden"; // Prevent scrolling behind
      
      // Focus trapping: focus the modal container first
      if (modalRef.current) {
        modalRef.current.focus();
      }
    }

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "";
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in"
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-title"
    >
      <div
        ref={modalRef}
        tabIndex={-1}
        className="w-full max-w-md bg-white rounded-2xl border border-gray-100 shadow-2xl p-6 relative overflow-hidden animate-slide-up focus:outline-none"
      >
        <div className="flex items-center justify-between mb-4">
          <h3 id="modal-title" className="text-lg font-bold text-gray-900">
            {title}
          </h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 rounded-lg p-1 hover:bg-gray-50 transition-colors"
            aria-label="Close modal"
          >
            <Icon name="x" size={16} />
          </button>
        </div>
        <div>{children}</div>
      </div>
    </div>
  );
}

/**
 * Alert Modal replacing `window.alert()`
 */
export function AlertModal({ isOpen, onClose, title = "Notification", message, type = "info" }) {
  const colors = {
    info: "text-blue-500 bg-blue-50 border border-blue-100",
    success: "text-green-500 bg-green-50 border border-green-100",
    error: "text-red-500 bg-red-50 border border-red-100",
    warning: "text-amber-500 bg-amber-50 border border-amber-100",
  };

  const icons = {
    info: "eye",
    success: "check",
    error: "alert",
    warning: "alert",
  };

  return (
    <ModalBase isOpen={isOpen} onClose={onClose} title={title}>
      <div className="space-y-4">
        <div className="flex items-start gap-3">
          <div className={`p-2 rounded-xl flex-shrink-0 ${colors[type] || colors.info}`}>
            <Icon name={icons[type] || "eye"} size={20} />
          </div>
          <p className="text-sm text-gray-600 leading-relaxed pt-1.5">{message}</p>
        </div>
        <div className="flex justify-end pt-2">
          <Button onClick={onClose} variant="primary">
            OK
          </Button>
        </div>
      </div>
    </ModalBase>
  );
}

/**
 * Confirm Modal replacing `window.confirm()`
 */
export function ConfirmModal({ isOpen, onClose, onConfirm, title = "Are you sure?", message, confirmText = "Confirm", cancelText = "Cancel" }) {
  return (
    <ModalBase isOpen={isOpen} onClose={onClose} title={title}>
      <div className="space-y-4">
        <p className="text-sm text-gray-600 leading-relaxed">{message}</p>
        <div className="flex justify-end gap-3 pt-2">
          <Button onClick={onClose} variant="secondary">
            {cancelText}
          </Button>
          <Button
            onClick={() => {
              onConfirm();
              onClose();
            }}
            variant="primary"
          >
            {confirmText}
          </Button>
        </div>
      </div>
    </ModalBase>
  );
}

/**
 * Prompt Modal replacing `window.prompt()`
 */
export function PromptModal({ isOpen, onClose, onConfirm, title = "Input Required", label, placeholder, defaultValue = "", type = "text" }) {
  const [value, setValue] = React.useState("");

  useEffect(() => {
    if (isOpen) {
      setValue(defaultValue);
    }
  }, [isOpen, defaultValue]);

  const handleSubmit = (e) => {
    e.preventDefault();
    onConfirm(value);
    onClose();
  };

  return (
    <ModalBase isOpen={isOpen} onClose={onClose} title={title}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <Input
          label={label}
          type={type}
          placeholder={placeholder}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          required
          autoFocus
        />
        <div className="flex justify-end gap-3 pt-2">
          <Button type="button" onClick={onClose} variant="secondary">
            Cancel
          </Button>
          <Button type="submit" variant="primary">
            Submit
          </Button>
        </div>
      </form>
    </ModalBase>
  );
}
