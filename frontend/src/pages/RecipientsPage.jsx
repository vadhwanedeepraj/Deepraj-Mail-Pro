import React, { useState, useRef } from "react";
import Papa from "papaparse";
import * as XLSX from "xlsx";
import { Card } from "../components/ui/Card";
import { Input, Textarea, Select } from "../components/ui/Input";
import { Button } from "../components/ui/Button";
import { Badge } from "../components/ui/Badge";
import { Icon } from "../components/ui/Icon";
import { AlertModal } from "../components/ui/Modal";
import { validateEmail, sanitizeColumns } from "../utils/validators";

export function RecipientsPage({
  data,
  setData,
  columns,
  setColumns,
  emailCol,
  setEmailCol,
  nameCol,
  setNameCol,
  idCol,
  setIdCol,
  pdfFiles,
  setPdfFiles,
  onNext
}) {
  const fileRef = useRef(null);
  const pdfRef = useRef(null);
  
  const [manualEmailsInput, setManualEmailsInput] = useState("");
  const [search, setSearch] = useState("");
  const [alertState, setAlertState] = useState({ isOpen: false, title: "", message: "", type: "info" });

  const showAlert = (title, message, type = "info") => {
    setAlertState({ isOpen: true, title, message, type });
  };

  const autoSetColumns = (cols) => {
    const ec = cols.find((c) => /email/i.test(c)) || cols[0] || "";
    const nc = cols.find((c) => /name/i.test(c)) || "";
    const ic = cols.find((c) => /^(id|enrollment|usn|roll)/i.test(c)) || "";
    setEmailCol(ec);
    setNameCol(nc);
    setIdCol(ic);
  };

  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const isCsv = file.name.endsWith(".csv");
    if (isCsv) {
      Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        complete: ({ data: rows, meta }) => {
          const cols = sanitizeColumns(meta.fields || []);
          const cleaned = rows.map((row) => {
            const obj = {};
            meta.fields.forEach((orig, i) => {
              obj[cols[i]] = row[orig];
            });
            return obj;
          });
          setData(cleaned);
          setColumns(cols);
          autoSetColumns(cols);
        },
        error: (err) => {
          showAlert("CSV Parse Error", err.message, "error");
        }
      });
    } else {
      const reader = new FileReader();
      reader.onload = (ev) => {
        try {
          const wb = XLSX.read(ev.target.result, { type: "array" });
          const ws = wb.Sheets[wb.SheetNames[0]];
          const rows = XLSX.utils.sheet_to_json(ws, { defval: "" });
          if (!rows.length) {
            showAlert("Excel Empty", "The uploaded spreadsheet has no rows.", "warning");
            return;
          }
          const origCols = Object.keys(rows[0]);
          const cols = sanitizeColumns(origCols);
          const cleaned = rows.map((row) => {
            const obj = {};
            origCols.forEach((orig, i) => {
              obj[cols[i]] = row[orig];
            });
            return obj;
          });
          setData(cleaned);
          setColumns(cols);
          autoSetColumns(cols);
        } catch (err) {
          showAlert("Excel Parse Error", err.message, "error");
        }
      };
      reader.readAsArrayBuffer(file);
    }
  };

  const handlePdfUpload = (e) => {
    const files = Array.from(e.target.files).filter((f) => f.name.endsWith(".pdf"));
    if (files.length === 0) return;
    
    setPdfFiles((prev) => {
      const existing = new Set(prev.map((f) => f.name));
      return [...prev, ...files.filter((f) => !existing.has(f.name))];
    });
  };

  const handleAddManualEmails = () => {
    if (!manualEmailsInput.trim()) return;

    const rawItems = manualEmailsInput.split(/[\n,;]+/);
    const parsedList = [];

    for (let item of rawItems) {
      item = item.trim();
      if (!item) continue;

      const match = item.match(/(.+?)<(.+?)>/);
      if (match) {
        const name = match[1].trim();
        const email = match[2].trim();
        if (validateEmail(email)) {
          parsedList.push({ email, name, id: "" });
        }
      } else {
        if (validateEmail(item)) {
          parsedList.push({ email: item, name: item.split("@")[0], id: "" });
        }
      }
    }

    if (parsedList.length === 0) {
      showAlert("Validation Error", "No valid email addresses found in the input.", "warning");
      return;
    }

    const newColumns = ["email", "name", "id"];

    setData((prev) => {
      const existing = prev || [];
      const mappedList = parsedList.map((item) => ({
        email: item.email,
        name: item.name,
        id: item.id
      }));
      return [...existing, ...mappedList];
    });

    setColumns((prev) => {
      const union = new Set([...prev, ...newColumns]);
      return Array.from(union);
    });

    setEmailCol("email");
    setNameCol("name");
    setIdCol("id");

    setManualEmailsInput("");
    showAlert("Success", `Successfully added ${parsedList.length} manual email(s) to the list!`, "success");
  };

  const filteredData = data && search
    ? data.filter((row) =>
        Object.values(row).some((v) =>
          String(v).toLowerCase().includes(search.toLowerCase())
        )
      )
    : data;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900">Recipients</h2>
        <p className="text-gray-500 text-sm mt-1">Upload your CSV or Excel file with recipient data</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Upload Spreadsheet */}
        <Card>
          <h3 className="font-semibold text-gray-800 mb-4 flex items-center gap-2">
            <Icon name="upload" size={16} /> Spreadsheet Upload
          </h3>
          <div
            onClick={() => fileRef.current?.click()}
            className="border-2 border-dashed border-gray-200 rounded-xl p-8 text-center cursor-pointer hover:border-blue-400 hover:bg-blue-50/50 transition-all group"
          >
            <div className="w-12 h-12 rounded-2xl bg-blue-50 flex items-center justify-center mx-auto mb-3 group-hover:bg-blue-100 transition-colors">
              <Icon name="table" size={22} className="text-blue-500" />
            </div>
            <p className="text-sm font-medium text-gray-700">Drop CSV or Excel file</p>
            <p className="text-xs text-gray-400 mt-1">or click to browse</p>
            <input
              ref={fileRef}
              type="file"
              accept=".csv,.xlsx,.xls"
              className="hidden"
              onChange={handleFileUpload}
            />
          </div>
          {data && (
            <div className="mt-4 flex items-center gap-3 p-3 bg-green-50 rounded-xl">
              <Icon name="check" size={16} className="text-green-600 flex-shrink-0" />
              <span className="text-sm text-green-700 font-medium">
                {data.length} rows loaded, {columns.length} columns
              </span>
            </div>
          )}
        </Card>

        {/* Manual Email Entry */}
        <Card>
          <h3 className="font-semibold text-gray-800 mb-4 flex items-center gap-2">
            <Icon name="mail" size={16} /> Manual Email Entry
            <Badge color="gray">optional</Badge>
          </h3>
          <div className="space-y-3">
            <Textarea
              placeholder="Enter emails separated by commas, semicolons, or newlines. Example:&#10;john@example.com&#10;Jane Doe <jane@example.com>;"
              rows={4}
              value={manualEmailsInput}
              onChange={(e) => setManualEmailsInput(e.target.value)}
              className="w-full text-xs font-mono h-[116px] resize-y"
            />
            <Button
              onClick={handleAddManualEmails}
              icon={<Icon name="plus" size={14} />}
              className="w-full justify-center text-xs py-2"
            >
              Add to Recipients List
            </Button>
          </div>
        </Card>

        {/* PDF Attachments */}
        <Card>
          <h3 className="font-semibold text-gray-800 mb-4 flex items-center gap-2">
            <Icon name="paperclip" size={16} /> PDF Attachments
            <Badge color="gray">optional</Badge>
          </h3>
          <div
            onClick={() => pdfRef.current?.click()}
            className="border-2 border-dashed border-gray-200 rounded-xl p-8 text-center cursor-pointer hover:border-violet-400 hover:bg-violet-50/50 transition-all group"
          >
            <div className="w-12 h-12 rounded-2xl bg-violet-50 flex items-center justify-center mx-auto mb-3 group-hover:bg-violet-100 transition-colors">
              <Icon name="paperclip" size={22} className="text-violet-500" />
            </div>
            <p className="text-sm font-medium text-gray-700">Upload PDF files</p>
            <p className="text-xs text-gray-400 mt-1">Matched by ID or Name column</p>
            <input
              ref={pdfRef}
              type="file"
              accept=".pdf"
              multiple
              className="hidden"
              onChange={handlePdfUpload}
            />
          </div>
          {pdfFiles.length > 0 && (
            <div className="mt-3 space-y-1.5 max-h-32 overflow-y-auto">
              {pdfFiles.map((f, i) => (
                <div key={i} className="flex items-center justify-between p-2 bg-gray-50 rounded-lg">
                  <span className="text-xs text-gray-600 truncate flex-1">{f.name}</span>
                  <button
                    onClick={() => setPdfFiles((p) => p.filter((_, j) => j !== i))}
                    className="text-gray-400 hover:text-red-500 ml-2"
                  >
                    <Icon name="x" size={13} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      {/* Column mapping */}
      {columns.length > 0 && (
        <Card>
          <h3 className="font-semibold text-gray-800 mb-4">Column Mapping</h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Select
              label="Email column *"
              options={columns}
              value={emailCol}
              onChange={(e) => setEmailCol(e.target.value)}
            />
            <Select
              label="Name column"
              options={columns}
              value={nameCol}
              onChange={(e) => setNameCol(e.target.value)}
            />
            <Select
              label="ID column (for PDF matching)"
              options={columns}
              value={idCol}
              onChange={(e) => setIdCol(e.target.value)}
            />
          </div>
        </Card>
      )}

      {/* Data preview */}
      {filteredData && (
        <Card className="overflow-hidden animate-fade-in">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-gray-800">Data Preview</h3>
            <input
              type="text"
              placeholder="Search recipients..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 w-56"
            />
          </div>
          <div className="overflow-x-auto rounded-xl border border-gray-100">
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  {columns.map((c) => (
                    <th
                      key={c}
                      className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide"
                    >
                      {c}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filteredData.slice(0, 8).map((row, i) => (
                  <tr key={i} className="hover:bg-gray-50 transition-colors">
                    {columns.map((c) => (
                      <td key={c} className="px-4 py-2.5 text-gray-700 max-w-32 truncate">
                        {String(row[c] ?? "")}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
            {filteredData.length > 8 && (
              <div className="px-4 py-2 bg-gray-50 text-xs text-gray-400 text-center border-t border-gray-100">
                Showing 8 of {filteredData.length} rows
              </div>
            )}
          </div>
        </Card>
      )}

      {data && (
        <div className="flex justify-end">
          <Button onClick={onNext} icon={<Icon name="template" size={16} />}>
            Next: Template →
          </Button>
        </div>
      )}

      <AlertModal
        isOpen={alertState.isOpen}
        onClose={() => setAlertState((prev) => ({ ...prev, isOpen: false }))}
        title={alertState.title}
        message={alertState.message}
        type={alertState.type}
      />
    </div>
  );
}
export default RecipientsPage;
