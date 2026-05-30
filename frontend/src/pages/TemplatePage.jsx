import React from "react";
import ReactQuill from "react-quill";
import "react-quill/dist/quill.snow.css";
import { Card } from "../components/ui/Card";
import { Input } from "../components/ui/Input";
import { Button } from "../components/ui/Button";
import { Icon } from "../components/ui/Icon";
import { renderTemplate } from "../utils/validators";

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
  const previewRow = data?.[previewIndex] ?? {};
  const previewBody = renderTemplate(bodyWith, previewRow);
  const previewSubject = renderTemplate(subject, previewRow);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900">Email Template</h2>
        <p className="text-gray-500 text-sm mt-1">Use {"{{ column_name }}"} as placeholders</p>
      </div>

      {columns.length > 0 && (
        <div className="flex flex-wrap gap-2 animate-fade-in">
          {columns.map((c) => (
            <button
              key={c}
              onClick={() => navigator.clipboard?.writeText(`{{ ${c} }}`)}
              className="px-2.5 py-1 bg-blue-50 text-blue-700 border border-blue-200 rounded-lg text-xs font-mono hover:bg-blue-100 transition-colors"
              title="Click to copy placeholder"
            >
              {"{{ "}{c}{" }}"}
            </button>
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Editor Inputs */}
        <div className="space-y-5">
          <Card>
            <Input
              label="Subject line"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Your update — {{ Name }}"
            />
          </Card>
          
          <Card>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Body — with PDF attachment
            </label>
            <div className="border border-gray-200 rounded-xl overflow-hidden">
              <ReactQuill
                theme="snow"
                value={bodyWith}
                onChange={setBodyWith}
                className="bg-white [&_.ql-toolbar]:border-none [&_.ql-container]:border-none [&_.ql-toolbar]:border-b [&_.ql-toolbar]:border-gray-200 [&_.ql-editor]:min-h-[150px]"
              />
            </div>
            <p className="text-xs text-gray-400 mt-2">
              Sent when a matching PDF is found. Supports rich text formatting.
            </p>
          </Card>

          <Card>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Body — without PDF attachment
            </label>
            <div className="border border-gray-200 rounded-xl overflow-hidden">
              <ReactQuill
                theme="snow"
                value={bodyWithout}
                onChange={setBodyWithout}
                className="bg-white [&_.ql-toolbar]:border-none [&_.ql-container]:border-none [&_.ql-toolbar]:border-b [&_.ql-toolbar]:border-gray-200 [&_.ql-editor]:min-h-[150px]"
              />
            </div>
            <p className="text-xs text-gray-400 mt-2">
              Sent when no matching PDF is found. Supports rich text formatting.
            </p>
          </Card>
        </div>

        {/* Live Preview Panel */}
        <div className="space-y-4">
          <Card className="sticky top-24">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-gray-800 flex items-center gap-2">
                <Icon name="eye" size={16} /> Live Preview
              </h3>
              {data && (
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setPreviewIndex(Math.max(0, previewIndex - 1))}
                    className="w-7 h-7 rounded-lg border border-gray-200 flex items-center justify-center text-gray-500 hover:bg-gray-50 text-xs"
                    disabled={previewIndex === 0}
                  >
                    ‹
                  </button>
                  <span className="text-xs text-gray-500">
                    {previewIndex + 1}/{data.length}
                  </span>
                  <button
                    onClick={() => setPreviewIndex(Math.min((data?.length || 1) - 1, previewIndex + 1))}
                    className="w-7 h-7 rounded-lg border border-gray-200 flex items-center justify-center text-gray-500 hover:bg-gray-50 text-xs"
                    disabled={previewIndex === data.length - 1}
                  >
                    ›
                  </button>
                </div>
              )}
            </div>
            
            {/* Template Preview render */}
            <div className="border border-gray-200 rounded-xl overflow-hidden bg-white">
              <div className="bg-gray-50 px-4 py-3 border-b border-gray-200">
                <p className="text-xs text-gray-500">Subject</p>
                <p className="text-sm font-medium text-gray-800 mt-0.5">{previewSubject || "—"}</p>
              </div>
              <div className="px-4 py-4">
                {data ? (
                  <div
                    className="text-sm text-gray-700 leading-relaxed ql-editor px-0 py-0"
                    dangerouslySetInnerHTML={{ __html: previewBody }}
                  />
                ) : (
                  <p className="text-sm text-gray-400 italic">Upload data to see preview</p>
                )}
              </div>
              {pdfFiles.length > 0 && (
                <div className="px-4 py-3 bg-violet-50 border-t border-violet-100 flex items-center gap-2 animate-fade-in">
                  <Icon name="paperclip" size={14} className="text-violet-500" />
                  <span className="text-xs text-violet-600">PDF attachment will be matched and included</span>
                </div>
              )}
            </div>
          </Card>
        </div>
      </div>

      <div className="flex justify-between">
        <Button variant="secondary" onClick={onBack}>
          ← Back
        </Button>
        <Button onClick={onNext} icon={<Icon name="settings" size={16} />}>
          Next: Settings →
        </Button>
      </div>
    </div>
  );
}
export default TemplatePage;
