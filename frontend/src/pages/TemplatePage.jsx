import React, { useState, useRef, useEffect, useCallback } from "react";
import ReactQuill from "react-quill";
import "react-quill/dist/quill.snow.css";
import { Card } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { Icon } from "../components/ui/Icon";
import { renderTemplate } from "../utils/validators";
import { useAuth } from "../context/AuthContext";
import { useApi } from "../hooks/useApi";

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
  onNext,
  backendUrl
}) {
  const { email, token } = useAuth();
  const { request } = useApi();
  const [activeTab, setActiveTab] = useState("with"); // "with" | "without"
  const [showVariables, setShowVariables] = useState(false);
  const dropdownRef = useRef(null);

  // ── Send Test Email ──────────────────────────────────────────────────────
  const [showTestEmail, setShowTestEmail]     = useState(false);
  const [testEmailSending, setTestEmailSending] = useState(false);
  const [testEmailStatus, setTestEmailStatus]   = useState(null); // null | "success" | "error"
  const [testEmailMsg, setTestEmailMsg]         = useState("");

  // ── Spam Score Checker ───────────────────────────────────────────────────
  const [showSpamChecker, setShowSpamChecker] = useState(false);
  const [spamScore, setSpamScore]             = useState(0);
  const [spamFlags, setSpamFlags]             = useState([]);

  // ── Dark Mode Preview ────────────────────────────────────────────────────
  const [darkModePreview, setDarkModePreview] = useState(false);

  // ── Draft Auto-save ──────────────────────────────────────────────────────
  const [draftRestoreAvail, setDraftRestoreAvail] = useState(false);
  const [draftSavedAt, setDraftSavedAt]           = useState(null);

  const [showCTA, setShowCTA] = useState(false);
  const [btnText, setBtnText] = useState("Click Here");
  const [btnLink, setBtnLink] = useState("https://");
  const [btnStyle, setBtnStyle] = useState("blue");

  const [showGallery, setShowGallery] = useState(false);
  const [showSignature, setShowSignature] = useState(false);

  // States for Image Builder
  const [showImgPanel, setShowImgPanel] = useState(false);
  const [imgUrl, setImgUrl] = useState("https://");
  const [imgWidth, setImgWidth] = useState("100%");
  const [imgHeight, setImgHeight] = useState("auto");

  // Load signature details from localStorage with robust defaults
  const [sigName, setSigName] = useState(() => localStorage.getItem("dm_sig_name") || "");
  const [sigTitle, setSigTitle] = useState(() => localStorage.getItem("dm_sig_title") || "");
  const [sigCompany, setSigCompany] = useState(() => localStorage.getItem("dm_sig_company") || "");
  const [sigPhone, setSigPhone] = useState(() => localStorage.getItem("dm_sig_phone") || "");
  const [sigEmail, setSigEmail] = useState(() => localStorage.getItem("dm_sig_email") || "");
  const [sigWebsite, setSigWebsite] = useState(() => localStorage.getItem("dm_sig_website") || "");
  const [sigStyle, setSigStyle] = useState(() => localStorage.getItem("dm_sig_style") || "minimalist");

  const quillWithRef = useRef(null);
  const quillWithoutRef = useRef(null);

  // Dynamic signature responsive HTML generation
  const minimalistSig = `
    <table cellpadding="0" cellspacing="0" border="0" style="font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif;font-size:13px;color:#334155;margin-top:20px;border-top:1px solid #cbd5e1;padding-top:12px;width:100%;">
      <tr>
        <td style="font-weight:bold;font-size:15px;color:#0f172a;">${sigName || "Your Name"}</td>
      </tr>
      <tr>
        <td style="color:#64748b;font-size:12px;padding-top:2px;">${sigTitle || "Your Title"}${sigCompany ? ` | ${sigCompany}` : ""}</td>
      </tr>
      <tr>
        <td style="color:#64748b;font-size:12px;padding-top:4px;">
          ${sigPhone ? `T: ${sigPhone} &bull; ` : ""}${sigEmail ? `E: ${sigEmail} &bull; ` : ""}${sigWebsite ? `W: <a href="${sigWebsite.startsWith("http") ? sigWebsite : "https://" + sigWebsite}" style="color:#2563eb;text-decoration:none;">${sigWebsite}</a>` : ""}
        </td>
      </tr>
    </table>
  `;

  const corporateSig = `
    <table cellpadding="0" cellspacing="0" border="0" style="font-family:sans-serif;font-size:12px;color:#334155;margin-top:20px;width:100%;max-width:500px;">
      <tr>
        <td style="width:3px;background-color:#2563eb;border-radius:2px;" rowspan="3">&nbsp;</td>
        <td style="padding-left:12px;font-weight:bold;font-size:14px;color:#1e293b;">${sigName || "Your Name"}</td>
      </tr>
      <tr>
        <td style="padding-left:12px;color:#475569;font-style:italic;padding-top:2px;">${sigTitle || "Your Title"}${sigCompany ? ` &mdash; ${sigCompany}` : ""}</td>
      </tr>
      <tr>
        <td style="padding-left:12px;color:#64748b;padding-top:4px;">
          ${sigPhone ? `<strong>T:</strong> ${sigPhone} &nbsp;|&nbsp; ` : ""}${sigEmail ? `<strong>E:</strong> ${sigEmail} &nbsp;|&nbsp; ` : ""}${sigWebsite ? `<strong>W:</strong> <a href="${sigWebsite.startsWith("http") ? sigWebsite : "https://" + sigWebsite}" style="color:#2563eb;text-decoration:none;">${sigWebsite}</a>` : ""}
        </td>
      </tr>
    </table>
  `;

  const creativeSig = `
    <table cellpadding="0" cellspacing="0" border="0" style="font-family:Georgia,serif;font-size:13px;color:#18181b;margin-top:20px;border-top:2px solid #7c3aed;padding-top:10px;width:100%;">
      <tr>
        <td style="font-weight:bold;font-size:16px;color:#7c3aed;font-style:italic;">${sigName || "Your Name"}</td>
      </tr>
      <tr>
        <td style="color:#d97706;font-size:11px;font-weight:600;letter-spacing:0.5px;text-transform:uppercase;padding-top:2px;font-family:sans-serif;">${sigTitle || "Your Title"}</td>
      </tr>
      <tr>
        <td style="color:#71717a;font-size:12px;padding-top:4px;font-family:sans-serif;">
          ${sigCompany ? `<strong>${sigCompany}</strong> &bull; ` : ""}${sigPhone ? `${sigPhone} &bull; ` : ""}${sigWebsite ? `<a href="${sigWebsite.startsWith("http") ? sigWebsite : "https://" + sigWebsite}" style="color:#7c3aed;text-decoration:none;">${sigWebsite}</a>` : ""}
        </td>
      </tr>
    </table>
  `;

  // Autoload pre-designed responsive templates
  const newsletterTemplate = `
<div style="font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif;max-width:600px;margin:0 auto;border:1px solid #e2e8f0;border-radius:16px;overflow:hidden;box-shadow:0 4px 6px -1px rgba(0,0,0,0.05);">
  <div style="background:linear-gradient(135deg, #2563eb 0%, #7c3aed 100%);padding:30px;text-align:center;">
    <h1 style="color:#ffffff;margin:0;font-size:24px;font-weight:800;letter-spacing:-0.5px;">Product Spotlight 🚀</h1>
    <p style="color:#dbeafe;margin:5px 0 0 0;font-size:14px;">Exciting new features built just for you</p>
  </div>
  <div style="padding:25px;background-color:#ffffff;color:#334155;line-height:1.6;font-size:14px;">
    <p style="margin-top:0;">Dear <strong>{{ Name }}</strong>,</p>
    <p>We are thrilled to share some powerful updates designed to supercharge your workflow and save you hours of manual task tracking.</p>
    
    <div style="background-color:#f8fafc;border:1px solid #f1f5f9;border-radius:12px;padding:16px;margin:20px 0;">
      <h3 style="margin-top:0;color:#0f172a;font-size:15px;">🌟 Core Upgrades</h3>
      <ul style="margin:0;padding-left:20px;color:#475569;">
        <li><strong>Dynamic SMTP Rotation:</strong> Maximize deliverability instantly.</li>
        <li><strong>Real-time Progress:</strong> Live sending state with zero data loss.</li>
        <li><strong>Interactive CTA Builder:</strong> Create responsive visual buttons in clicks.</li>
      </ul>
    </div>

    <p style="margin-bottom:0;text-align:center;">
      <a href="https://example.com" style="display:inline-block;background-color:#2563eb;color:#ffffff;font-weight:bold;padding:12px 24px;border-radius:8px;text-decoration:none;font-size:13px;box-shadow:0 4px 6px rgba(37,99,235,0.2);">Explore All Features</a>
    </p>
  </div>
</div>
`;

  const proposalTemplate = `
<div style="font-family:Georgia,serif;max-width:550px;margin:20px auto;color:#18181b;line-height:1.7;font-size:14px;padding:30px;border-top:4px solid #7c3aed;background-color:#ffffff;box-shadow:0 1px 3px rgba(0,0,0,0.05);">
  <h2 style="font-family:sans-serif;font-weight:800;color:#09090b;font-size:20px;margin-top:0;letter-spacing:-0.5px;">Business Collaboration Proposal</h2>
  <p style="color:#71717a;font-size:12px;font-family:sans-serif;text-transform:uppercase;letter-spacing:1px;margin-bottom:25px;">Confidential &middot; Prepared for {{ Company }}</p>
  
  <p>Dear <strong>{{ Name }}</strong>,</p>
  
  <p>I hope this letter finds you well.</p>
  
  <p>Following up on our recent conversation, I am writing to submit our formal partnership proposal. We have analyzed {{ Company }}'s growth targets and designed a customized integration pathway that aligns perfectly with your operations.</p>
  
  <blockquote style="border-left:3px solid #7c3aed;margin:20px 0;padding-left:15px;color:#52525b;font-style:italic;">
    "Our ultimate objective is to drive client engagement upwards by 40% while trimming redundancies."
  </blockquote>
  
  <p>We would love to schedule a brief 10-minute demonstration call next Tuesday to review the strategic metrics and answer any operational questions you may have.</p>
  
  <p>Please click the button below to secure a calendar slot that fits your schedule.</p>
  
  <p style="text-align:center;margin-top:25px;">
    <a href="https://calendly.com" style="display:inline-block;background-color:#7c3aed;color:#ffffff;font-family:sans-serif;font-weight:bold;padding:12px 28px;border-radius:6px;text-decoration:none;font-size:13px;">Book Calibration Call</a>
  </p>
</div>
`;

  const invoiceTemplate = `
<div style="font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif;max-width:600px;margin:10px auto;border:1px solid #e4e4e7;border-radius:12px;overflow:hidden;background-color:#ffffff;color:#27272a;font-size:14px;box-shadow:0 1px 3px rgba(0,0,0,0.02);">
  <div style="background-color:#f4f4f5;padding:20px;border-bottom:1px solid #e4e4e7;display:flex;justify-content:space-between;align-items:center;">
    <div>
      <h3 style="margin:0;font-size:16px;font-weight:700;">Account Statement</h3>
      <p style="margin:2px 0 0 0;font-size:11px;color:#71717a;">Statement ID: {{ Invoice_Id }}</p>
    </div>
  </div>
  <div style="padding:20px;line-height:1.5;">
    <p style="margin-top:0;">Dear <strong>{{ Name }}</strong>,</p>
    <p>Thank you for your business. Here is the summary statement of services rendered for your account this month:</p>
    
    <table cellpadding="0" cellspacing="0" border="0" style="width:100%;margin:20px 0;border-collapse:collapse;font-size:12px;">
      <thead>
        <tr style="background-color:#f4f4f5;color:#52525b;font-weight:bold;border-bottom:1px solid #e4e4e7;">
          <th style="padding:8px 10px;text-align:left;">Service Description</th>
          <th style="padding:8px 10px;text-align:right;width:100px;">Hours</th>
          <th style="padding:8px 10px;text-align:right;width:120px;">Amount Due</th>
        </tr>
      </thead>
      <tbody>
        <tr style="border-bottom:1px solid #f4f4f5;">
          <td style="padding:10px;color:#18181b;">Enterprise Core Subscription Development</td>
          <td style="padding:10px;text-align:right;color:#71717a;">16.5 hrs</td>
          <td style="padding:10px;text-align:right;font-weight:600;color:#18181b;">$2,475.00</td>
        </tr>
        <tr style="border-bottom:1px solid #f4f4f5;">
          <td style="padding:10px;color:#18181b;">SMTP Proxy Server Configuration</td>
          <td style="padding:10px;text-align:right;color:#71717a;">4.0 hrs</td>
          <td style="padding:10px;text-align:right;font-weight:600;color:#18181b;">$600.00</td>
        </tr>
        <tr style="background-color:#fafafa;font-weight:bold;border-top:1px solid #e4e4e7;">
          <td style="padding:10px;color:#18181b;" colspan="2">Total Outstanding Balance</td>
          <td style="padding:10px;text-align:right;color:#2563eb;font-size:13px;">$3,075.00</td>
        </tr>
      </tbody>
    </table>

    <p style="font-size:12px;color:#71717a;text-align:center;margin-top:25px;">
      If you have any billing inquiries, please contact <a href="mailto:billing@example.com" style="color:#2563eb;text-decoration:none;">billing@example.com</a>. Thank you!
    </p>
  </div>
</div>
`;

  // ── 3 New Templates ──────────────────────────────────────────────────────
  const welcomeTemplate = `
<div style="font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif;max-width:600px;margin:0 auto;border:1px solid #e2e8f0;border-radius:16px;overflow:hidden;">
  <div style="background:linear-gradient(135deg,#10b981 0%,#059669 100%);padding:32px;text-align:center;">
    <div style="font-size:40px;">👋</div>
    <h1 style="color:#fff;margin:8px 0 4px;font-size:24px;font-weight:800;">Welcome, {{ Name }}!</h1>
    <p style="color:#d1fae5;margin:0;font-size:14px;">We're so glad to have you on board.</p>
  </div>
  <div style="padding:28px;background:#ffffff;color:#374151;line-height:1.7;font-size:14px;">
    <p>Hi <strong>{{ Name }}</strong>, your account is ready and waiting.</p>
    <div style="background:#f0fdf4;border-left:4px solid #10b981;border-radius:8px;padding:14px 16px;margin:20px 0;">
      <p style="margin:0;font-weight:600;color:#065f46;">🚀 Getting Started Tips</p>
      <ul style="margin:8px 0 0;padding-left:18px;color:#047857;">
        <li>Complete your profile setup</li>
        <li>Explore the dashboard features</li>
        <li>Reach out if you need help</li>
      </ul>
    </div>
    <p style="text-align:center;margin-top:24px;">
      <a href="https://example.com" style="display:inline-block;background:#10b981;color:#fff;font-weight:bold;padding:12px 28px;border-radius:8px;text-decoration:none;font-size:13px;">Get Started →</a>
    </p>
  </div>
</div>
`;

  const eventTemplate = `
<div style="font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif;max-width:600px;margin:0 auto;border:1px solid #e2e8f0;border-radius:16px;overflow:hidden;">
  <div style="background:linear-gradient(135deg,#f59e0b 0%,#d97706 100%);padding:32px;text-align:center;">
    <div style="font-size:40px;">📅</div>
    <h1 style="color:#fff;margin:8px 0 4px;font-size:22px;font-weight:800;">You're Invited!</h1>
    <p style="color:#fef3c7;margin:0;font-size:14px;">A special event just for you</p>
  </div>
  <div style="padding:28px;background:#fff;color:#374151;line-height:1.7;font-size:14px;">
    <p>Dear <strong>{{ Name }}</strong>,</p>
    <p>We are delighted to invite you to our upcoming event. Don't miss this exclusive opportunity.</p>
    <table cellpadding="0" cellspacing="0" border="0" style="width:100%;margin:20px 0;border-collapse:collapse;">
      <tr><td style="padding:8px 12px;background:#fffbeb;border:1px solid #fde68a;border-radius:8px 8px 0 0;"><strong>📍 Location:</strong> Main Conference Hall</td></tr>
      <tr><td style="padding:8px 12px;background:#fffbeb;border:1px solid #fde68a;border-left:1px solid #fde68a;border-right:1px solid #fde68a;"><strong>🗓 Date:</strong> Saturday, 28 June 2026</td></tr>
      <tr><td style="padding:8px 12px;background:#fffbeb;border:1px solid #fde68a;border-radius:0 0 8px 8px;"><strong>⏰ Time:</strong> 10:00 AM — 4:00 PM</td></tr>
    </table>
    <p style="text-align:center;margin-top:24px;">
      <a href="https://example.com/rsvp" style="display:inline-block;background:#f59e0b;color:#fff;font-weight:bold;padding:12px 28px;border-radius:8px;text-decoration:none;font-size:13px;">✅ RSVP Now</a>
    </p>
  </div>
</div>
`;

  const reengageTemplate = `
<div style="font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif;max-width:600px;margin:0 auto;border:1px solid #e2e8f0;border-radius:16px;overflow:hidden;">
  <div style="background:linear-gradient(135deg,#6366f1 0%,#8b5cf6 100%);padding:32px;text-align:center;">
    <div style="font-size:40px;">💜</div>
    <h1 style="color:#fff;margin:8px 0 4px;font-size:22px;font-weight:800;">We miss you, {{ Name }}!</h1>
    <p style="color:#ede9fe;margin:0;font-size:14px;">It's been a while — here's something special.</p>
  </div>
  <div style="padding:28px;background:#fff;color:#374151;line-height:1.7;font-size:14px;">
    <p>Hi <strong>{{ Name }}</strong>,</p>
    <p>We noticed you haven't been around lately. We've been working on exciting new updates!</p>
    <div style="background:#f5f3ff;border-radius:12px;padding:20px;margin:20px 0;text-align:center;">
      <p style="font-size:18px;font-weight:800;color:#6d28d9;margin:0;">🎁 Special Comeback Offer</p>
      <p style="font-size:13px;color:#7c3aed;margin:6px 0 0;">Use code <strong>WELCOMEBACK</strong> for 20% off — expires in 7 days.</p>
    </div>
    <p style="text-align:center;margin-top:24px;">
      <a href="https://example.com" style="display:inline-block;background:#6366f1;color:#fff;font-weight:bold;padding:12px 28px;border-radius:8px;text-decoration:none;font-size:13px;">Come Back & Explore →</a>
    </p>
  </div>
</div>
`;


  // Persist signature inputs to localStorage automatically
  useEffect(() => {
    localStorage.setItem("dm_sig_name", sigName);
    localStorage.setItem("dm_sig_title", sigTitle);
    localStorage.setItem("dm_sig_company", sigCompany);
    localStorage.setItem("dm_sig_phone", sigPhone);
    localStorage.setItem("dm_sig_email", sigEmail);
    localStorage.setItem("dm_sig_website", sigWebsite);
    localStorage.setItem("dm_sig_style", sigStyle);
  }, [sigName, sigTitle, sigCompany, sigPhone, sigEmail, sigWebsite, sigStyle]);

  // Draft auto-save every 30 seconds
  useEffect(() => {
    const saved = localStorage.getItem("dm_draft_subject");
    if (saved) setDraftRestoreAvail(true);
  }, []);

  useEffect(() => {
    const timer = setInterval(() => {
      localStorage.setItem("dm_draft_subject",    subject);
      localStorage.setItem("dm_draft_bodywith",   bodyWith);
      localStorage.setItem("dm_draft_bodywithout", bodyWithout);
      setDraftSavedAt(new Date().toLocaleTimeString());
    }, 30000);
    return () => clearInterval(timer);
  }, [subject, bodyWith, bodyWithout]);

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

  const handleInsertButton = (bText, bLink, bStyle) => {
    const quillEditor = activeTab === "with" 
      ? quillWithRef.current?.getEditor() 
      : quillWithoutRef.current?.getEditor();

    if (quillEditor) {
      const range = quillEditor.getSelection(true);
      const colors = {
        blue: "#2563eb",
        green: "#10b981",
        violet: "#7c3aed",
        dark: "#1e293b"
      };
      const bg = colors[bStyle] || "#2563eb";
      // Bulletproof HTML email button
      const buttonHtml = `<p><a href="${bLink}" style="display:inline-block;background-color:${bg};color:#ffffff;font-family:sans-serif;font-size:14px;font-weight:bold;line-height:44px;text-align:center;text-decoration:none;width:200px;border-radius:10px;margin-top:10px;margin-bottom:10px;">${bText}</a></p>`;
      
      quillEditor.clipboard.dangerouslyPasteHTML(range.index, buttonHtml);
      quillEditor.setSelection(range.index + buttonHtml.length);
    }
  };

  const handleInsertSignature = (style) => {
    const quillEditor = activeTab === "with" 
      ? quillWithRef.current?.getEditor() 
      : quillWithoutRef.current?.getEditor();

    if (quillEditor) {
      const range = quillEditor.getSelection(true);
      let sigHtml = "";
      if (style === "minimalist") sigHtml = minimalistSig;
      else if (style === "corporate") sigHtml = corporateSig;
      else if (style === "creative") sigHtml = creativeSig;

      quillEditor.clipboard.dangerouslyPasteHTML(range.index, sigHtml);
      quillEditor.setSelection(range.index + sigHtml.length);
    }
  };

  const handleLoadTemplate = (tplHtml) => {
    const confirm = window.confirm("Are you sure you want to load this template? It will OVERWRITE all current email content in the editor.");
    if (!confirm) return;

    if (activeTab === "with") {
      setBodyWith(tplHtml);
    } else {
      setBodyWithout(tplHtml);
    }
  };

  const handleInsertImage = (url, width, height) => {
    const quillEditor = activeTab === "with" 
      ? quillWithRef.current?.getEditor() 
      : quillWithoutRef.current?.getEditor();

    if (quillEditor) {
      const range = quillEditor.getSelection(true);
      const styleString = `max-width:100%; width:${width || "auto"}; height:${height || "auto"}; display:block; margin: 10px 0; border-radius: 8px;`;
      const imgHtml = `<p><img src="${url}" style="${styleString}" alt="Email Image" /></p>`;
      
      quillEditor.clipboard.dangerouslyPasteHTML(range.index, imgHtml);
      quillEditor.setSelection(range.index + imgHtml.length);
    }
  };

  // Custom Quill Toolbar configuration (compact & clean with image upload/insert support)
  const quillModules = {
    toolbar: [
      ['bold', 'italic', 'underline', 'strike'],
      [{ 'list': 'ordered'}, { 'list': 'bullet' }],
      ['link', 'image', 'clean']
    ]
  };

  // ── Send Test Email ──────────────────────────────────────────────────────
  const handleSendTestEmail = async () => {
    if (!backendUrl) return;
    setTestEmailSending(true);
    setTestEmailStatus(null);
    const body = activeTab === "with" ? bodyWith : bodyWithout;
    try {
      const res = await fetch(`${backendUrl}/api/send-test`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
        body: JSON.stringify({ subject, body })
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message || "Failed");
      setTestEmailStatus("success");
      setTestEmailMsg(json.message);
    } catch (err) {
      setTestEmailStatus("error");
      setTestEmailMsg(err.message);
    } finally {
      setTestEmailSending(false);
      setTimeout(() => setTestEmailStatus(null), 5000);
    }
  };

  // ── Spam Score Checker ───────────────────────────────────────────────────
  const SPAM_WORDS = [
    "free", "winner", "click here", "urgent", "limited time", "act now", "guaranteed",
    "no risk", "cash", "earn money", "make money", "100%", "buy now", "order now",
    "subscribe now", "special offer", "bonus", "prize", "congratulations", "exclusive deal",
    "discount", "cheap", "lowest price", "bargain", "amazing", "incredible offer",
    "unsubscribe", "opt-in", "click below", "risk-free"
  ];

  const handleCheckSpam = useCallback(() => {
    const text = (subject + " " + bodyWith + " " + bodyWithout).toLowerCase();
    const found = SPAM_WORDS.filter(w => text.includes(w));
    const score = Math.min(10, Math.round((found.length / SPAM_WORDS.length) * 20));
    setSpamFlags(found);
    setSpamScore(score);
    setShowSpamChecker(true);
  }, [subject, bodyWith, bodyWithout]);

  // ── Draft Restore ────────────────────────────────────────────────────────
  const handleRestoreDraft = () => {
    const s = localStorage.getItem("dm_draft_subject");
    const bw = localStorage.getItem("dm_draft_bodywith");
    const bwo = localStorage.getItem("dm_draft_bodywithout");
    if (s)   setSubject(s);
    if (bw)  setBodyWith(bw);
    if (bwo) setBodyWithout(bwo);
    setDraftRestoreAvail(false);
  };

  const handleDiscardDraft = () => {
    localStorage.removeItem("dm_draft_subject");
    localStorage.removeItem("dm_draft_bodywith");
    localStorage.removeItem("dm_draft_bodywithout");
    setDraftRestoreAvail(false);
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {draftRestoreAvail && (
        <div className="p-4 bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-100 rounded-2xl flex items-center justify-between text-blue-800 text-sm animate-fade-in shadow-sm">
          <div className="flex items-center gap-3">
            <Icon name="alert" size={18} className="text-blue-600" />
            <span className="font-medium">An unsaved email template draft was found from your last session.</span>
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleRestoreDraft}
              className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition-all shadow-sm shadow-blue-100"
            >
              Restore Draft
            </button>
            <button
              onClick={handleDiscardDraft}
              className="px-3.5 py-1.5 bg-white text-gray-700 border border-gray-200 hover:bg-gray-50 rounded-xl text-xs font-bold transition-all"
            >
              Discard
            </button>
          </div>
        </div>
      )}
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
                {draftSavedAt && (
                  <span className="text-[10px] text-gray-400 font-semibold italic mr-2">
                    Draft saved at {draftSavedAt}
                  </span>
                )}
                <button
                  type="button"
                  onClick={handleSendTestEmail}
                  disabled={testEmailSending}
                  className="px-2.5 py-1 rounded-lg border border-blue-200 bg-blue-50 text-blue-700 text-xs font-bold hover:bg-blue-100 transition-all flex items-center gap-1.5 shadow-sm"
                >
                  <Icon name="send" size={12} /> {testEmailSending ? "Sending..." : "Send Test"}
                </button>
                <button
                  type="button"
                  onClick={handleCheckSpam}
                  className="px-2.5 py-1 rounded-lg border border-amber-200 bg-amber-50 text-amber-700 text-xs font-bold hover:bg-amber-100 transition-all flex items-center gap-1.5 shadow-sm"
                >
                  <Icon name="alert" size={12} /> Spam Check
                </button>
                <span className="text-[10px] bg-blue-50 text-blue-600 font-semibold px-2 py-0.5 rounded-md border border-blue-100">
                  Rich Text / HTML
                </span>
              </div>
            </div>

            {/* Test Email Status Message */}
            {testEmailStatus && (
              <div className={`px-4 py-2.5 border-b text-xs font-semibold flex items-center justify-between animate-fade-in ${
                testEmailStatus === "success" ? "bg-green-50 text-green-700 border-green-100" : "bg-red-50 text-red-700 border-red-100"
              }`}>
                <span>{testEmailMsg}</span>
                <button onClick={() => setTestEmailStatus(null)} className="text-gray-400 hover:text-gray-600 font-bold">×</button>
              </div>
            )}

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

              {/* CTA Button Builder Row */}
              <div className="bg-slate-50/40 px-4 py-2 border-b border-gray-100 text-sm">
                <div className="flex justify-between items-center">
                  <span className="text-gray-400 w-16 flex-shrink-0 font-medium">Add Button:</span>
                  <button
                    type="button"
                    onClick={() => setShowCTA(!showCTA)}
                    className="text-xs font-bold text-blue-600 hover:text-blue-700 hover:underline flex items-center gap-1"
                  >
                    <Icon name="zap" size={13} /> {showCTA ? "Hide CTA Builder" : "Create Call-to-Action Button"}
                  </button>
                </div>
                {showCTA && (
                  <div className="mt-3 p-4 bg-white border border-gray-200 rounded-2xl space-y-3.5 animate-fade-in shadow-sm">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Button Text</label>
                        <input
                          type="text"
                          className="w-full px-3 py-1.5 border border-gray-200 rounded-xl text-xs bg-slate-50 focus:bg-white transition-all text-gray-800"
                          value={btnText}
                          onChange={(e) => setBtnText(e.target.value)}
                          placeholder="e.g. Download Document"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Button Theme</label>
                        <select
                          className="w-full px-3 py-1.5 border border-gray-200 rounded-xl text-xs bg-slate-50 focus:bg-white transition-all text-gray-800 font-semibold"
                          value={btnStyle}
                          onChange={(e) => setBtnStyle(e.target.value)}
                        >
                          <option value="blue">Royal Blue</option>
                          <option value="green">Forest Green</option>
                          <option value="violet">Sunset Violet</option>
                          <option value="dark">Deep Charcoal</option>
                        </select>
                      </div>
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Button Link / URL</label>
                      <input
                        type="text"
                        className="w-full px-3 py-1.5 border border-gray-200 rounded-xl text-xs bg-slate-50 focus:bg-white transition-all text-gray-800 font-mono"
                        value={btnLink}
                        onChange={(e) => setBtnLink(e.target.value)}
                        placeholder="e.g. {{ Document_Url }} or https://..."
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        handleInsertButton(btnText, btnLink, btnStyle);
                        setShowCTA(false);
                      }}
                      className="px-3.5 py-2 bg-gradient-to-r from-blue-600 to-violet-600 text-white rounded-xl text-xs font-bold hover:from-blue-700 hover:to-violet-700 transition-all w-full flex items-center justify-center gap-1.5 shadow-md shadow-blue-100"
                    >
                      <Icon name="plus" size={13} /> Insert CTA Button to Editor
                    </button>
                  </div>
                )}
              </div>

              {/* Add Image Builder Row */}
              <div className="bg-slate-50/40 px-4 py-2 border-b border-gray-100 text-sm">
                <div className="flex justify-between items-center">
                  <span className="text-gray-400 w-16 flex-shrink-0 font-medium">Add Image:</span>
                  <button
                    type="button"
                    onClick={() => {
                      setShowImgPanel(!showImgPanel);
                      setShowCTA(false);
                      setShowGallery(false);
                      setShowSignature(false);
                    }}
                    className="text-xs font-bold text-emerald-600 hover:text-emerald-700 hover:underline flex items-center gap-1"
                  >
                    <Icon name="eye" size={13} className="text-emerald-600" /> {showImgPanel ? "Hide Image Panel" : "Insert Image via URL/Width"}
                  </button>
                </div>
                {showImgPanel && (
                  <div className="mt-3 p-4 bg-white border border-gray-200 rounded-2xl space-y-3.5 animate-fade-in shadow-sm">
                    <div>
                      <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Image URL</label>
                      <input
                        type="text"
                        className="w-full px-3 py-1.5 border border-gray-200 rounded-xl text-xs bg-slate-50 focus:bg-white transition-all text-gray-800 font-mono"
                        value={imgUrl}
                        onChange={(e) => setImgUrl(e.target.value)}
                        placeholder="e.g. https://yourdomain.com/banner.png"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Width</label>
                        <input
                          type="text"
                          className="w-full px-3 py-1.5 border border-gray-200 rounded-xl text-xs bg-slate-50 focus:bg-white transition-all text-gray-800"
                          value={imgWidth}
                          onChange={(e) => setImgWidth(e.target.value)}
                          placeholder="e.g. 100% or 300px"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Height</label>
                        <input
                          type="text"
                          className="w-full px-3 py-1.5 border border-gray-200 rounded-xl text-xs bg-slate-50 focus:bg-white transition-all text-gray-800"
                          value={imgHeight}
                          onChange={(e) => setImgHeight(e.target.value)}
                          placeholder="e.g. auto or 200px"
                        />
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        handleInsertImage(imgUrl, imgWidth, imgHeight);
                        setShowImgPanel(false);
                      }}
                      className="px-3.5 py-2 bg-gradient-to-r from-emerald-600 to-teal-600 text-white rounded-xl text-xs font-bold hover:from-emerald-700 hover:to-teal-700 transition-all w-full flex items-center justify-center gap-1.5 shadow-md shadow-emerald-100"
                    >
                      <Icon name="plus" size={13} /> Insert Image to Editor
                    </button>
                  </div>
                )}
              </div>

              {/* Template Gallery Row */}
              <div className="bg-slate-50/40 px-4 py-2 border-b border-gray-100 text-sm">
                <div className="flex justify-between items-center">
                  <span className="text-gray-400 w-16 flex-shrink-0 font-medium">Layouts:</span>
                  <button
                    type="button"
                    onClick={() => {
                      setShowGallery(!showGallery);
                      setShowSignature(false);
                      setShowCTA(false);
                    }}
                    className="text-xs font-bold text-violet-600 hover:text-violet-700 hover:underline flex items-center gap-1"
                  >
                    <Icon name="template" size={13} className="text-violet-600" /> {showGallery ? "Hide Layouts Gallery" : "Select Pre-designed Template Layout"}
                  </button>
                </div>
                {showGallery && (
                  <div className="mt-3 p-4 bg-white border border-gray-200 rounded-2xl space-y-4 animate-fade-in shadow-sm">
                    <div className="px-1">
                      <h4 className="text-xs font-bold text-gray-700 uppercase tracking-wider">Load Premium Template Layouts</h4>
                      <p className="text-[11px] text-gray-400 mt-0.5">Select a layout below to instantly populate your active editor with responsive HTML designs.</p>
                    </div>
                    
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      {/* Card 1: Newsletter */}
                      <div className="border border-gray-100 rounded-2xl overflow-hidden hover:border-violet-300 hover:shadow-md hover:scale-[1.02] transition-all flex flex-col justify-between bg-slate-50/20 group">
                        <div className="h-20 bg-gradient-to-tr from-blue-500 to-violet-500 flex items-center justify-center p-3 text-center">
                          <span className="text-white font-extrabold text-[11px] tracking-tight drop-shadow-sm">Product Spotlight 🚀</span>
                        </div>
                        <div className="p-3 flex-grow flex flex-col justify-between">
                          <div className="mb-3">
                            <h5 className="text-xs font-bold text-gray-800">Modern Newsletter</h5>
                            <p className="text-[10px] text-gray-400 mt-1">Stunning top banner, clean features list, centered call-to-action button.</p>
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              handleLoadTemplate(newsletterTemplate);
                              setShowGallery(false);
                            }}
                            className="w-full py-1.5 bg-violet-50 text-violet-700 font-bold rounded-xl text-[10px] hover:bg-violet-600 hover:text-white transition-all border border-violet-100 shadow-sm"
                          >
                            Apply Layout
                          </button>
                        </div>
                      </div>

                      {/* Card 2: Corporate Proposal */}
                      <div className="border border-gray-100 rounded-2xl overflow-hidden hover:border-violet-300 hover:shadow-md hover:scale-[1.02] transition-all flex flex-col justify-between bg-slate-50/20 group">
                        <div className="h-20 bg-white border-b border-gray-100 flex items-center justify-center p-3 text-center">
                          <span className="text-gray-800 font-serif font-extrabold text-[12px] tracking-tight border-t-2 border-violet-600 pt-1">Formal Proposal 📄</span>
                        </div>
                        <div className="p-3 flex-grow flex flex-col justify-between">
                          <div className="mb-3">
                            <h5 className="text-xs font-bold text-gray-800">Corporate Proposal</h5>
                            <p className="text-[10px] text-gray-400 mt-1">Georgia serif elegance, formal letter headers, styled blockquotes, and link slots.</p>
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              handleLoadTemplate(proposalTemplate);
                              setShowGallery(false);
                            }}
                            className="w-full py-1.5 bg-violet-50 text-violet-700 font-bold rounded-xl text-[10px] hover:bg-violet-600 hover:text-white transition-all border border-violet-100 shadow-sm"
                          >
                            Apply Layout
                          </button>
                        </div>
                      </div>

                      {/* Card 3: Detailed Invoice */}
                      <div className="border border-gray-100 rounded-2xl overflow-hidden hover:border-violet-300 hover:shadow-md hover:scale-[1.02] transition-all flex flex-col justify-between bg-slate-50/20 group">
                        <div className="h-20 bg-slate-100 border-b border-gray-200 flex items-center justify-center p-3 text-center">
                          <span className="text-gray-500 font-mono text-[10px] uppercase font-bold tracking-widest border border-dashed border-gray-300 px-2 py-1 rounded">Statement Table 📊</span>
                        </div>
                        <div className="p-3 flex-grow flex flex-col justify-between">
                          <div className="mb-3">
                            <h5 className="text-xs font-bold text-gray-800">Detailed Statement</h5>
                            <p className="text-[10px] text-gray-400 mt-1">Structured accounting template with styled invoices, totals, and tabular amounts.</p>
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              handleLoadTemplate(invoiceTemplate);
                              setShowGallery(false);
                            }}
                            className="w-full py-1.5 bg-violet-50 text-violet-700 font-bold rounded-xl text-[10px] hover:bg-violet-600 hover:text-white transition-all border border-violet-100 shadow-sm"
                          >
                            Apply Layout
                          </button>
                        </div>
                      </div>

                      {/* Card 4: Welcome Email */}
                      <div className="border border-gray-100 rounded-2xl overflow-hidden hover:border-violet-300 hover:shadow-md hover:scale-[1.02] transition-all flex flex-col justify-between bg-slate-50/20 group">
                        <div className="h-20 bg-gradient-to-tr from-emerald-500 to-teal-500 flex items-center justify-center p-3 text-center">
                          <span className="text-white font-extrabold text-[11px] tracking-tight drop-shadow-sm">Welcome onboarding 👋</span>
                        </div>
                        <div className="p-3 flex-grow flex flex-col justify-between">
                          <div className="mb-3">
                            <h5 className="text-xs font-bold text-gray-800">Welcome Onboarding</h5>
                            <p className="text-[10px] text-gray-400 mt-1">Green vibrant gradient header, personal greeting, and onboarding next steps.</p>
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              handleLoadTemplate(welcomeTemplate);
                              setShowGallery(false);
                            }}
                            className="w-full py-1.5 bg-violet-50 text-violet-700 font-bold rounded-xl text-[10px] hover:bg-violet-600 hover:text-white transition-all border border-violet-100 shadow-sm"
                          >
                            Apply Layout
                          </button>
                        </div>
                      </div>

                      {/* Card 5: Event Invitation */}
                      <div className="border border-gray-100 rounded-2xl overflow-hidden hover:border-violet-300 hover:shadow-md hover:scale-[1.02] transition-all flex flex-col justify-between bg-slate-50/20 group">
                        <div className="h-20 bg-gradient-to-tr from-amber-500 to-orange-500 flex items-center justify-center p-3 text-center">
                          <span className="text-white font-extrabold text-[11px] tracking-tight drop-shadow-sm">Event Invitation 📅</span>
                        </div>
                        <div className="p-3 flex-grow flex flex-col justify-between">
                          <div className="mb-3">
                            <h5 className="text-xs font-bold text-gray-800">Event Invitation</h5>
                            <p className="text-[10px] text-gray-400 mt-1">Warm orange calendar theme, schedule list table, and big RSVP action button.</p>
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              handleLoadTemplate(eventTemplate);
                              setShowGallery(false);
                            }}
                            className="w-full py-1.5 bg-violet-50 text-violet-700 font-bold rounded-xl text-[10px] hover:bg-violet-600 hover:text-white transition-all border border-violet-100 shadow-sm"
                          >
                            Apply Layout
                          </button>
                        </div>
                      </div>

                      {/* Card 6: Re-engagement */}
                      <div className="border border-gray-100 rounded-2xl overflow-hidden hover:border-violet-300 hover:shadow-md hover:scale-[1.02] transition-all flex flex-col justify-between bg-slate-50/20 group">
                        <div className="h-20 bg-gradient-to-tr from-indigo-500 to-purple-500 flex items-center justify-center p-3 text-center">
                          <span className="text-white font-extrabold text-[11px] tracking-tight drop-shadow-sm">We Miss You 💜</span>
                        </div>
                        <div className="p-3 flex-grow flex flex-col justify-between">
                          <div className="mb-3">
                            <h5 className="text-xs font-bold text-gray-800">Re-engagement</h5>
                            <p className="text-[10px] text-gray-400 mt-1">Sunset violet theme, discount/comeback offer banner, and a comeback call-to-action.</p>
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              handleLoadTemplate(reengageTemplate);
                              setShowGallery(false);
                            }}
                            className="w-full py-1.5 bg-violet-50 text-violet-700 font-bold rounded-xl text-[10px] hover:bg-violet-600 hover:text-white transition-all border border-violet-100 shadow-sm"
                          >
                            Apply Layout
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Signature Builder Row */}
              <div className="bg-slate-50/40 px-4 py-2 border-b border-gray-100 text-sm">
                <div className="flex justify-between items-center">
                  <span className="text-gray-400 w-16 flex-shrink-0 font-medium">Signature:</span>
                  <button
                    type="button"
                    onClick={() => {
                      setShowSignature(!showSignature);
                      setShowGallery(false);
                      setShowCTA(false);
                    }}
                    className="text-xs font-bold text-emerald-600 hover:text-emerald-700 hover:underline flex items-center gap-1"
                  >
                    <Icon name="settings" size={13} className="text-emerald-600" /> {showSignature ? "Hide Signature Builder" : "Design Visual Email Signature"}
                  </button>
                </div>
                {showSignature && (
                  <div className="mt-3 p-4 bg-white border border-gray-200 rounded-2xl space-y-4 animate-fade-in shadow-sm">
                    <div className="px-1">
                      <h4 className="text-xs font-bold text-gray-700 uppercase tracking-wider">Visual Signature Designer</h4>
                      <p className="text-[11px] text-gray-400 mt-0.5">Customize your digital business signature card and insert it directly into your email body.</p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-12 gap-5">
                      {/* Editor Fields */}
                      <div className="md:col-span-6 space-y-3">
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Full Name</label>
                            <input
                              type="text"
                              className="w-full px-3 py-1.5 border border-gray-200 rounded-xl text-xs bg-slate-50 focus:bg-white transition-all text-gray-800 font-semibold"
                              value={sigName}
                              onChange={(e) => setSigName(e.target.value)}
                              placeholder="e.g. Deepraj Vadhwane"
                            />
                          </div>
                          <div>
                            <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Job Title</label>
                            <input
                              type="text"
                              className="w-full px-3 py-1.5 border border-gray-200 rounded-xl text-xs bg-slate-50 focus:bg-white transition-all text-gray-800"
                              value={sigTitle}
                              onChange={(e) => setSigTitle(e.target.value)}
                              placeholder="e.g. Lead Developer"
                            />
                          </div>
                        </div>
                        
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Company</label>
                            <input
                              type="text"
                              className="w-full px-3 py-1.5 border border-gray-200 rounded-xl text-xs bg-slate-50 focus:bg-white transition-all text-gray-800"
                              value={sigCompany}
                              onChange={(e) => setSigCompany(e.target.value)}
                              placeholder="e.g. Deepraj Tech"
                            />
                          </div>
                          <div>
                            <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Phone Number</label>
                            <input
                              type="text"
                              className="w-full px-3 py-1.5 border border-gray-200 rounded-xl text-xs bg-slate-50 focus:bg-white transition-all text-gray-800"
                              value={sigPhone}
                              onChange={(e) => setSigPhone(e.target.value)}
                              placeholder="e.g. +91 98765 43210"
                            />
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Business Email</label>
                            <input
                              type="text"
                              className="w-full px-3 py-1.5 border border-gray-200 rounded-xl text-xs bg-slate-50 focus:bg-white transition-all text-gray-800"
                              value={sigEmail}
                              onChange={(e) => setSigEmail(e.target.value)}
                              placeholder="e.g. deepraj@tech.com"
                            />
                          </div>
                          <div>
                            <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Website URL</label>
                            <input
                              type="text"
                              className="w-full px-3 py-1.5 border border-gray-200 rounded-xl text-xs bg-slate-50 focus:bg-white transition-all text-gray-800"
                              value={sigWebsite}
                              onChange={(e) => setSigWebsite(e.target.value)}
                              placeholder="e.g. deeprajtech.com"
                            />
                          </div>
                        </div>

                        <div>
                          <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Signature Theme Style</label>
                          <select
                            className="w-full px-3 py-2 border border-gray-200 rounded-xl text-xs bg-slate-50 focus:bg-white transition-all text-gray-800 font-semibold"
                            value={sigStyle}
                            onChange={(e) => setSigStyle(e.target.value)}
                          >
                            <option value="minimalist">Modern Minimalist (Clean Line)</option>
                            <option value="corporate">Classic Corporate (Blue Left Bar)</option>
                            <option value="creative">Creative Sunset (Violet Serif Top-bar)</option>
                          </select>
                        </div>
                      </div>

                      {/* Real-time Visual Preview Panel */}
                      <div className="md:col-span-6 flex flex-col justify-between border border-gray-100 rounded-2xl p-4 bg-slate-50/50">
                        <div>
                          <span className="text-[10px] bg-emerald-50 text-emerald-700 font-bold px-2 py-0.5 rounded border border-emerald-100 tracking-wider">
                            LIVE SIGNATURE PREVIEW
                          </span>
                          <div className="mt-4 p-3 bg-white border border-gray-200 rounded-xl min-h-[110px] flex items-center justify-center">
                            <div
                              className="w-full"
                              dangerouslySetInnerHTML={{
                                __html: sigStyle === "minimalist" ? minimalistSig : sigStyle === "corporate" ? corporateSig : creativeSig
                              }}
                            />
                          </div>
                        </div>
                        
                        <button
                          type="button"
                          onClick={() => {
                            handleInsertSignature(sigStyle);
                            setShowSignature(false);
                          }}
                          className="mt-4 px-3.5 py-2 bg-gradient-to-r from-emerald-600 to-teal-600 text-white rounded-xl text-xs font-bold hover:from-emerald-700 hover:to-teal-700 transition-all w-full flex items-center justify-center gap-1.5 shadow-md shadow-emerald-100"
                        >
                          <Icon name="plus" size={13} /> Insert This Signature to Editor
                        </button>
                      </div>
                    </div>
                  </div>
                )}
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

            {/* Spam Score Checker Panel */}
            {showSpamChecker && (
              <div className="p-4 bg-slate-50 border-b border-gray-100 animate-fade-in space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">Deliverability Score:</span>
                    <span className={`px-2 py-0.5 rounded text-xs font-extrabold ${
                      spamScore < 3 ? "bg-green-100 text-green-700" : spamScore < 6 ? "bg-amber-100 text-amber-700" : "bg-red-100 text-red-700"
                    }`}>
                      {spamScore} / 10
                    </span>
                  </div>
                  <button
                    onClick={() => setShowSpamChecker(false)}
                    className="text-gray-400 hover:text-gray-600 text-xs font-semibold"
                  >
                    Close
                  </button>
                </div>
                <div className="text-xs text-gray-500">
                  {spamFlags.length === 0 ? (
                    <span className="text-green-600 font-medium">✓ No spam trigger words found! Excellent template.</span>
                  ) : (
                    <div>
                      <span className="text-amber-600 font-medium">Flagged words found ({spamFlags.length}): </span>
                      <div className="flex flex-wrap gap-1.5 mt-1">
                        {spamFlags.map(w => (
                          <span key={w} className="px-2 py-0.5 bg-red-50 text-red-600 border border-red-100 rounded-md text-[10px] font-mono font-semibold">
                            {w}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

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
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setDarkModePreview(!darkModePreview)}
                  className={`px-2 py-1 rounded-lg border text-[10px] font-bold transition-all ${
                    darkModePreview
                      ? "bg-slate-800 text-white border-slate-700 shadow-sm"
                      : "bg-white text-gray-700 border-gray-200 hover:bg-gray-50"
                  }`}
                >
                  {darkModePreview ? "☀️ Light" : "🌙 Dark"}
                </button>
                {data && (
                  <div className="flex items-center gap-1.5">
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
              <div className={`px-5 py-6 min-h-[180px] max-h-[300px] overflow-y-auto border-b border-gray-50 transition-all ${
                darkModePreview ? "bg-slate-900" : "bg-white"
              }`}>
                {data ? (
                  <div
                    className="text-sm text-gray-700 leading-relaxed ql-editor p-0"
                    style={darkModePreview ? { filter: "invert(1) hue-rotate(180deg)", background: "#000" } : {}}
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
