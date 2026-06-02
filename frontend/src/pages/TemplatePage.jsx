import React, { useState, useRef, useEffect } from "react";
import ReactQuill from "react-quill";
import "react-quill/dist/quill.snow.css";
import { Card } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { Icon } from "../components/ui/Icon";
import { renderTemplate } from "../utils/validators";
import { useAuth } from "../context/AuthContext";

export function TemplatePage({
  columns,
  subject,
  setSubject,
  bodyWith,
  setBodyWith,
  bodyWithout,
  setBodyWithout,
  pdfFiles,
  data,
  previewIndex,
  setPreviewIndex,
  onBack,
  onNext
}) {
  const { email } = useAuth();
  const [activeTab, setActiveTab] = useState("with"); // "with" | "without"
  const [showVariables, setShowVariables] = useState(false);
  const dropdownRef = useRef(null);

  const quillWithRef = useRef(null);
  const quillWithoutRef = useRef(null);

  const previewRow = data?.[previewIndex] ?? {};
  const previewBody = renderTemplate(activeTab === "with" ? bodyWith : bodyWithout, previewRow);
  const previewSubject = renderTemplate(subject, previewRow);

  // Close dropdown on click outside
  useEffect(() => {
    function handleClickOutside(event) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setShowVariables(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleInsertVariable = (col) => {
    const quillEditor = activeTab === "with" 
      ? quillWithRef.current?.getEditor() 
      : quillWithoutRef.current?.getEditor();

    if (quillEditor) {
      const range = quillEditor.getSelection(true);
      const textToInsert = `{{ ${col} }}`;
      quillEditor.insertText(range.index, textToInsert);
      quillEditor.setSelection(range.index + textToInsert.length);
    }
  };

  // Custom Quill Toolbar configuration (compact & clean)
  const quillModules = {
    toolbar: [
      ['bold', 'italic', 'underline', 'strike'],
      [{ 'list': 'ordered'}, { 'list': 'bullet' }],
      ['link', 'clean']
    ]
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Email Composer</h2>
          <p className="text-gray-500 text-sm mt-1">Design and personalize your campaign message templates</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Gmail-Style Email Composer */}
        <div className="lg:col-span-7">
          <Card className="p-0 overflow-hidden border border-gray-200 shadow-xl shadow-slate-100 rounded-2xl bg-white">
            
            {/* Header / Title Bar */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 bg-slate-50/70">
              <span className="text-xs font-bold text-gray-500 uppercase tracking-wider flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-blue-600"></span> New Message
              </span>
              <div className="flex items-center gap-2">
                <span className="text-[10px] bg-blue-50 text-blue-600 font-semibold px-2 py-0.5 rounded-md border border-blue-100">
                  Rich Text / HTML
                </span>
              </div>
            </div>

            {/* Compose Header Fields */}
            <div className="bg-white border-b border-gray-100 divide-y divide-gray-100">
              {/* From Field */}
              <div className="flex items-center px-4 py-2.5 text-sm">
                <span className="text-gray-400 w-16 flex-shrink-0 font-medium">From:</span>
                <span className="text-gray-700 font-semibold truncate bg-slate-50 px-2.5 py-1 rounded-lg border border-slate-100 text-xs">
                  {email || "your-smtp-account@gmail.com"}
                </span>
              </div>

              {/* To Field with Variable Dropdown */}
              <div className="flex items-center px-4 py-2.5 text-sm justify-between gap-4">
                <div className="flex items-center min-w-0">
                  <span className="text-gray-400 w-16 flex-shrink-0 font-medium">To:</span>
                  <span className="bg-blue-50 text-blue-700 font-semibold px-3 py-1 rounded-full text-xs flex items-center gap-1.5 border border-blue-100 truncate">
                    👥 {data ? `${data.length} recipients loaded` : "No contacts loaded"}
                  </span>
                </div>

                {/* Variable Injector */}
                {columns.length > 0 && (
                  <div className="relative" ref={dropdownRef}>
                    <button
                      type="button"
                      onClick={() => setShowVariables(!showVariables)}
                      className="px-3 py-1 rounded-xl border border-blue-200 bg-blue-50 text-blue-700 text-xs font-bold hover:bg-blue-100 transition-all flex items-center gap-1.5 shadow-sm shadow-blue-50"
                    >
                      <Icon name="plus" size={13} /> {`Insert Variable`} ▾
                    </button>
                    {showVariables && (
                      <div className="absolute right-0 mt-2 w-52 bg-white border border-gray-200 rounded-xl shadow-xl z-30 py-1.5 max-h-56 overflow-y-auto animate-scale-in">
                        <div className="px-3 py-1 text-[10px] font-bold text-gray-400 uppercase tracking-wider border-b border-gray-50 mb-1">
                          Select Column
                        </div>
                        {columns.map(c => (
                          <button
                            key={c}
                            type="button"
                            onClick={() => {
                              handleInsertVariable(c);
                              setShowVariables(false);
                            }}
                            className="w-full text-left px-3.5 py-2 text-xs text-gray-700 hover:bg-slate-50 hover:text-blue-600 transition-colors font-mono"
                          >
                            {`{{ ${c} }}`}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Subject Line */}
              <div className="flex items-center px-4 py-2 text-sm">
                <span className="text-gray-400 w-16 flex-shrink-0 font-medium">Subject:</span>
                <input
                  type="text"
                  className="w-full bg-transparent border-none p-0 focus:ring-0 text-gray-800 placeholder-gray-400 font-semibold text-sm"
                  placeholder="Enter email subject... (use placeholders)"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                />
              </div>
            </div>

            {/* Template Variant Tabs */}
            <div className="flex border-b border-gray-100 bg-slate-50/40 text-xs font-semibold">
              <button
                type="button"
                onClick={() => setActiveTab("with")}
                className={`flex-1 py-3 text-center transition-all flex items-center justify-center gap-2 border-b-2 ${
                  activeTab === "with"
                    ? "border-blue-600 text-blue-600 bg-white"
                    : "border-transparent text-gray-400 hover:text-gray-600 hover:bg-gray-50/50"
                }`}
              >
                <Icon name="paperclip" size={14} className={activeTab === "with" ? "text-blue-600" : "text-gray-400"} />
                1. Standard Body (With PDF)
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("without")}
                className={`flex-1 py-3 text-center transition-all flex items-center justify-center gap-2 border-b-2 ${
                  activeTab === "without"
                    ? "border-blue-600 text-blue-600 bg-white"
                    : "border-transparent text-gray-400 hover:text-gray-600 hover:bg-gray-50/50"
                }`}
              >
                <Icon name="mail" size={14} className={activeTab === "without" ? "text-blue-600" : "text-gray-400"} />
                2. Alternate Body (No PDF)
              </button>
            </div>

            {/* Editor Container */}
            <div className="relative border-b border-gray-100">
              {activeTab === "with" ? (
                <ReactQuill
                  ref={quillWithRef}
                  theme="snow"
                  value={bodyWith}
                  onChange={setBodyWith}
                  modules={quillModules}
                  placeholder="Write the primary email template here... Sent when a matching PDF attachment is found."
                  className="bg-white [&_.ql-toolbar]:border-none [&_.ql-container]:border-none [&_.ql-editor]:min-h-[280px] [&_.ql-editor]:text-gray-800 [&_.ql-editor]:placeholder-gray-400 [&_.ql-editor]:text-sm"
                />
              ) : (
                <ReactQuill
                  ref={quillWithoutRef}
                  theme="snow"
                  value={bodyWithout}
                  onChange={setBodyWithout}
                  modules={quillModules}
                  placeholder="Write the fallback email template here... Sent when no matching PDF attachment is found."
                  className="bg-white [&_.ql-toolbar]:border-none [&_.ql-container]:border-none [&_.ql-editor]:min-h-[280px] [&_.ql-editor]:text-gray-800 [&_.ql-editor]:placeholder-gray-400 [&_.ql-editor]:text-sm"
                />
              )}
            </div>

            {/* Composer Footer (Action / "Send" Bar) */}
            <div className="flex items-center justify-between px-4 py-3 bg-slate-50/80">
              <div className="flex items-center gap-3">
                <Button onClick={onNext} icon={<Icon name="settings" size={16} />}>
                  Next: Settings
                </Button>
                <button
                  onClick={onBack}
                  className="px-3.5 py-2 text-xs font-semibold text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-xl transition-colors"
                >
                  ← Back to Upload
                </button>
              </div>
              <div className="text-[11px] text-gray-400 font-medium italic flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-violet-400"></span>
                {activeTab === "with" ? "Matched attachments will be appended" : "Direct plain-text email will be sent"}
              </div>
            </div>

          </Card>
        </div>

        {/* Live Preview Panel */}
        <div className="lg:col-span-5 space-y-4">
          <Card className="sticky top-24 border border-gray-200 shadow-md shadow-slate-100/50 rounded-2xl bg-white p-5">
            <div className="flex items-center justify-between mb-4 border-b border-gray-50 pb-3">
              <h3 className="font-bold text-gray-800 flex items-center gap-2 text-sm">
                <Icon name="eye" size={16} className="text-violet-600" /> Live Recipient Preview
              </h3>
              {data && (
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setPreviewIndex(Math.max(0, previewIndex - 1))}
                    className="w-7 h-7 rounded-lg border border-gray-200 flex items-center justify-center text-gray-500 hover:bg-gray-50 transition-colors text-xs font-bold disabled:opacity-50"
                    disabled={previewIndex === 0}
                  >
                    ‹
                  </button>
                  <span className="text-xs font-mono font-bold text-gray-500">
                    {previewIndex + 1}/{data.length}
                  </span>
                  <button
                    onClick={() => setPreviewIndex(Math.min((data?.length || 1) - 1, previewIndex + 1))}
                    className="w-7 h-7 rounded-lg border border-gray-200 flex items-center justify-center text-gray-500 hover:bg-gray-50 transition-colors text-xs font-bold disabled:opacity-50"
                    disabled={previewIndex === data.length - 1}
                  >
                    ›
                  </button>
                </div>
              )}
            </div>

            {/* Unified Email Client View */}
            <div className="border border-gray-200/80 rounded-2xl overflow-hidden shadow-sm bg-white">
              {/* Header Box */}
              <div className="bg-slate-50/50 px-4 py-3.5 border-b border-gray-100 space-y-2">
                <div className="flex items-center text-xs">
                  <span className="text-gray-400 w-14 font-medium">From:</span>
                  <span className="text-gray-700 font-semibold truncate">{email || "your-smtp@gmail.com"}</span>
                </div>
                <div className="flex items-center text-xs">
                  <span className="text-gray-400 w-14 font-medium">To:</span>
                  <span className="text-gray-700 font-bold truncate">
                    {previewRow[Object.keys(previewRow)[0]] || "recipient@gmail.com"}
                  </span>
                </div>
                <div className="flex items-start text-xs border-t border-gray-100/60 pt-2 mt-1">
                  <span className="text-gray-400 w-14 font-medium mt-0.5">Subject:</span>
                  <span className="text-gray-800 font-bold leading-normal truncate">{previewSubject || "(No Subject)"}</span>
                </div>
              </div>

              {/* Body Content */}
              <div className="px-5 py-6 min-h-[180px] max-h-[300px] overflow-y-auto border-b border-gray-50">
                {data ? (
                  <div
                    className="text-sm text-gray-700 leading-relaxed ql-editor p-0"
                    dangerouslySetInnerHTML={{ __html: previewBody }}
                  />
                ) : (
                  <div className="py-10 text-center text-gray-400 italic text-xs flex flex-col items-center gap-2">
                    <Icon name="mail" size={24} className="text-gray-300 animate-pulse" />
                    Upload contacts list to see dynamic preview
                  </div>
                )}
              </div>

              {/* Dynamic Footer matching attachments */}
              {activeTab === "with" && pdfFiles.length > 0 && (
                <div className="px-4 py-3 bg-violet-50/60 border-t border-violet-100 flex items-center justify-between gap-4 animate-fade-in">
                  <div className="flex items-center gap-2 min-w-0">
                    <Icon name="paperclip" size={14} className="text-violet-500 flex-shrink-0" />
                    <span className="text-xs font-semibold text-violet-700 truncate">
                      Matched PDF Attachment included
                    </span>
                  </div>
                  <span className="text-[10px] bg-violet-100 text-violet-700 font-bold px-2 py-0.5 rounded-full uppercase tracking-wider flex-shrink-0">
                    PDF Attached
                  </span>
                </div>
              )}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
export default TemplatePage;
