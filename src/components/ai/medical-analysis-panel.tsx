"use client";

import { useState, useRef } from "react";
import Link from "next/link";
import {
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  FileSpreadsheet,
  FileText,
  Flame,
  Info,
  Loader2,
  PhoneCall,
  RefreshCw,
  Scan,
  ShieldAlert,
  Sparkles,
  Stethoscope,
  Upload,
  X,
} from "lucide-react";
import type { MedicalAnalysisResponse, LabResultItem } from "@/app/api/assistant/analyze-report/route";

export function MedicalAnalysisPanel() {
  const [activeTab, setActiveTab] = useState<"lab_report" | "wound_skin">("lab_report");
  const [fileDataUrl, setFileDataUrl] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [textNotes, setTextNotes] = useState("");
  
  // Context states
  const [age, setAge] = useState("");
  const [duration, setDuration] = useState("");
  const [hasFever, setHasFever] = useState(false);
  const [tetanusRecent, setTetanusRecent] = useState<boolean | null>(null);
  
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<MedicalAnalysisResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 8 * 1024 * 1024) {
      setError("File exceeds 8MB limit. Please upload a smaller image or document.");
      return;
    }

    setFileName(file.name);
    setError(null);

    const reader = new FileReader();
    reader.onload = () => {
      setFileDataUrl(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  const clearFile = () => {
    setFileDataUrl(null);
    setFileName(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleAnalyze = async () => {
    if (!fileDataUrl && !textNotes.trim()) {
      setError("Please attach an image/report or describe the laboratory or wound details.");
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/assistant/analyze-report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: activeTab,
          fileDataUrl,
          textInput: textNotes,
          patientContext: {
            age: age || undefined,
            duration: duration || undefined,
            fever: hasFever,
            tetanusWithin5Years: tetanusRecent,
          },
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Server responded with status ${res.status}`);
      }

      const data: MedicalAnalysisResponse = await res.json();
      setResult(data);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Analysis failed. Please try again.";
      setError(msg);
    } finally {
      setIsLoading(false);
    }
  };

  const resetAll = () => {
    setResult(null);
    setError(null);
    clearFile();
    setTextNotes("");
    setDuration("");
    setHasFever(false);
    setTetanusRecent(null);
  };

  return (
    <div className="w-full rounded-3xl border border-border bg-card-elevated p-5 sm:p-7 shadow-xs">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border pb-5">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
            <Sparkles className="size-3.5" />
            <span>OpenAI Clinical Vision & Document Intelligence</span>
          </div>
          <h2 className="mt-2 text-xl font-bold tracking-tight text-foreground sm:text-2xl">
            Medical Report & Wound Analysis Assistant
          </h2>
          <p className="mt-1 text-xs sm:text-sm text-muted-foreground">
            Upload diagnostic blood tests, pathology summaries, or photos of superficial wounds for structured review.
          </p>
        </div>

        {/* Tab selection */}
        <div className="flex rounded-2xl border border-border bg-background p-1 text-xs">
          <button
            type="button"
            onClick={() => {
              setActiveTab("lab_report");
              setResult(null);
              setError(null);
            }}
            className={`flex items-center gap-2 rounded-xl px-3.5 py-2 font-medium transition-all ${
              activeTab === "lab_report"
                ? "bg-primary text-primary-foreground shadow-xs"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <FileSpreadsheet className="size-4" />
            Lab Reports
          </button>
          <button
            type="button"
            onClick={() => {
              setActiveTab("wound_skin");
              setResult(null);
              setError(null);
            }}
            className={`flex items-center gap-2 rounded-xl px-3.5 py-2 font-medium transition-all ${
              activeTab === "wound_skin"
                ? "bg-primary text-primary-foreground shadow-xs"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Flame className="size-4" />
            Wound & Skin Check
          </button>
        </div>
      </div>

      {!result ? (
        <div className="mt-6 space-y-6">
          {/* Upload Box */}
          <div className="rounded-2xl border-2 border-dashed border-border/80 bg-background/50 p-6 text-center transition-colors hover:border-primary/50">
            <input
              type="file"
              ref={fileInputRef}
              accept="image/*,.pdf"
              onChange={handleFileChange}
              className="hidden"
              id="medical-file-upload"
            />
            
            {fileDataUrl ? (
              <div className="flex flex-col items-center gap-3">
                {fileDataUrl.startsWith("data:image/") ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={fileDataUrl}
                    alt="Upload preview"
                    className="max-h-48 rounded-xl object-contain shadow-xs border border-border"
                  />
                ) : (
                  <div className="flex size-16 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                    <FileText className="size-8" />
                  </div>
                )}
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-foreground max-w-xs truncate">{fileName}</span>
                  <button
                    type="button"
                    onClick={clearFile}
                    className="rounded-lg p-1 text-muted-foreground hover:bg-muted hover:text-destructive"
                    title="Remove file"
                  >
                    <X className="size-4" />
                  </button>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  File ready for clinical analysis. You can also add notes below.
                </p>
              </div>
            ) : (
              <label
                htmlFor="medical-file-upload"
                className="flex flex-col items-center justify-center cursor-pointer gap-2 py-4"
              >
                <div className="flex size-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                  <Upload className="size-6" />
                </div>
                <p className="text-sm font-semibold text-foreground">
                  Click to upload {activeTab === "lab_report" ? "lab report (PDF or Image)" : "wound/skin photograph"}
                </p>
                <p className="text-xs text-muted-foreground">
                  Supported formats: JPG, PNG, WebP, PDF (Max 8MB). Processed securely on private server.
                </p>
              </label>
            )}
          </div>

          {/* Context questions */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-foreground mb-1">
                Patient Age / Context (Optional)
              </label>
              <input
                type="text"
                value={age}
                onChange={(e) => setAge(e.target.value)}
                placeholder="e.g. 38 years, Male"
                className="w-full rounded-xl border border-border bg-background px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-hidden"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-foreground mb-1">
                Duration / When did this begin?
              </label>
              <input
                type="text"
                value={duration}
                onChange={(e) => setDuration(e.target.value)}
                placeholder="e.g. 2 days ago, after cooking"
                className="w-full rounded-xl border border-border bg-background px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-hidden"
              />
            </div>
          </div>

          {/* Wound specific questions */}
          {activeTab === "wound_skin" && (
            <div className="rounded-2xl border border-border bg-background/50 p-4 space-y-3 text-xs">
              <p className="font-semibold text-foreground flex items-center gap-2">
                <Info className="size-3.5 text-primary" />
                Triage Safety Inquiries
              </p>
              <div className="flex flex-col sm:flex-row gap-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={hasFever}
                    onChange={(e) => setHasFever(e.target.checked)}
                    className="size-4 rounded border-border text-primary focus:ring-primary"
                  />
                  <span>Do you have fever, chills, or spreading warmth?</span>
                </label>

                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground">Tetanus shot within 5-10 yrs:</span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setTetanusRecent(true)}
                      className={`px-2 py-0.5 rounded-lg border text-[11px] ${
                        tetanusRecent === true
                          ? "bg-primary text-primary-foreground border-primary"
                          : "border-border text-foreground hover:bg-muted"
                      }`}
                    >
                      Yes
                    </button>
                    <button
                      type="button"
                      onClick={() => setTetanusRecent(false)}
                      className={`px-2 py-0.5 rounded-lg border text-[11px] ${
                        tetanusRecent === false
                          ? "bg-destructive text-destructive-foreground border-destructive"
                          : "border-border text-foreground hover:bg-muted"
                      }`}
                    >
                      No / Unsure
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Notes textarea */}
          <div>
            <label className="block text-xs font-semibold text-foreground mb-1">
              Additional Notes or Values (Optional)
            </label>
            <textarea
              rows={3}
              value={textNotes}
              onChange={(e) => setTextNotes(e.target.value)}
              placeholder={
                activeTab === "lab_report"
                  ? "Paste lab numbers or describe test details (e.g. HbA1c 7.4%, Fasting sugar 132)..."
                  : "Describe symptoms such as throbbing pain, discharge color, or how injury occurred..."
              }
              className="w-full rounded-xl border border-border bg-background p-3 text-xs text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-hidden"
            />
          </div>

          {error && (
            <div className="flex items-start gap-2.5 rounded-2xl border border-destructive/30 bg-destructive/10 p-3.5 text-xs text-destructive">
              <AlertCircle className="size-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <div className="flex items-center justify-between pt-2">
            <p className="text-[11px] text-muted-foreground max-w-md">
              Protected by patient privacy rules. Automated evaluations do not substitute for a clinician’s judgement.
            </p>
            <button
              type="button"
              onClick={handleAnalyze}
              disabled={isLoading || (!fileDataUrl && !textNotes.trim())}
              className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-xs font-semibold text-primary-foreground shadow-xs hover:bg-primary/90 disabled:opacity-50"
            >
              {isLoading ? (
                <>
                  <Loader2 className="size-3.5 animate-spin" />
                  Analyzing with Medical AI...
                </>
              ) : (
                <>
                  <Scan className="size-3.5" />
                  Analyze {activeTab === "lab_report" ? "Report" : "Wound Image"}
                </>
              )}
            </button>
          </div>
        </div>
      ) : (
        /* Results View */
        <div className="mt-6 space-y-6">
          {/* Emergency Alert Banner */}
          {result.isEmergency && (
            <div className="rounded-2xl border border-destructive/50 bg-destructive/15 p-4 sm:p-5 text-destructive-foreground animate-pulse">
              <div className="flex items-start gap-3">
                <ShieldAlert className="size-6 text-destructive shrink-0 mt-0.5" />
                <div className="space-y-1.5 flex-1">
                  <h3 className="text-sm font-bold text-destructive">
                    URGENT MEDICAL ATTENTION RECOMMENDED
                  </h3>
                  <p className="text-xs leading-relaxed text-foreground/90">
                    {result.emergencyReason ||
                      "Critical markers or acute signs detected that may indicate severe infection, burn depth compromise, or high-risk laboratory values. Do not delay professional evaluation."}
                  </p>
                  <div className="pt-2 flex flex-wrap items-center gap-3">
                    <a
                      href="tel:108"
                      className="inline-flex items-center gap-2 rounded-xl bg-destructive px-3.5 py-2 text-xs font-bold text-white shadow-xs hover:bg-destructive/90"
                    >
                      <PhoneCall className="size-3.5" />
                      Dial 108 Emergency Ambulance
                    </a>
                    <Link
                      href="/emergency"
                      className="inline-flex items-center gap-1.5 text-xs font-semibold text-destructive underline"
                    >
                      Open ORVEXA SOS Dispatch
                    </Link>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Clinical Summary */}
          <div className="rounded-2xl border border-border bg-background p-4 sm:p-5">
            <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              Clinical Assessment Summary
            </h3>
            <p className="mt-2 text-sm leading-relaxed text-foreground">
              {result.summary}
            </p>
          </div>

          {/* Lab Table */}
          {result.labItems && result.labItems.length > 0 && (
            <div className="overflow-hidden rounded-2xl border border-border bg-background">
              <div className="border-b border-border bg-muted/40 px-4 py-3">
                <h4 className="text-xs font-semibold text-foreground flex items-center gap-2">
                  <FileSpreadsheet className="size-4 text-primary" />
                  Extracted Biomarkers & Reference Ranges
                </h4>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="border-b border-border bg-muted/20 text-[11px] text-muted-foreground uppercase">
                    <tr>
                      <th className="px-4 py-2.5 font-medium">Test Name</th>
                      <th className="px-4 py-2.5 font-medium">Observed Value</th>
                      <th className="px-4 py-2.5 font-medium">Normal Range</th>
                      <th className="px-4 py-2.5 font-medium">Status Flag</th>
                      <th className="px-4 py-2.5 font-medium">Clinical Note</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/60">
                    {result.labItems.map((item, idx) => {
                      const flagClass =
                        item.flag === "NORMAL"
                          ? "bg-success-soft text-success border-success/30"
                          : item.flag === "CRITICAL"
                          ? "bg-destructive/15 text-destructive border-destructive/40 font-bold"
                          : "bg-warning-soft text-warning border-warning/30 font-semibold";
                      return (
                        <tr key={idx} className="hover:bg-muted/10">
                          <td className="px-4 py-3 font-semibold text-foreground">
                            {item.testName}
                          </td>
                          <td className="px-4 py-3 font-mono font-bold text-foreground">
                            {item.value} {item.unit}
                          </td>
                          <td className="px-4 py-3 text-muted-foreground font-mono">
                            {item.referenceRange} {item.unit}
                          </td>
                          <td className="px-4 py-3">
                            <span className={`inline-block rounded-md border px-2 py-0.5 text-[10px] ${flagClass}`}>
                              {item.flag}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-muted-foreground">
                            {item.clinicalContextNote || "—"}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Wound Features Display */}
          {result.woundFeatures && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="rounded-2xl border border-border bg-background p-4 space-y-3">
                <h4 className="text-xs font-semibold text-foreground flex items-center gap-2">
                  <Scan className="size-4 text-primary" />
                  Visual Surface Characterization
                </h4>
                <div className="space-y-2 text-xs">
                  <div>
                    <span className="font-semibold text-foreground">Visible Erythema:</span>{" "}
                    <span className="text-muted-foreground">{result.woundFeatures.visibleErythema}</span>
                  </div>
                  <div>
                    <span className="font-semibold text-foreground">Local Edema/Swelling:</span>{" "}
                    <span className="text-muted-foreground">{result.woundFeatures.swelling}</span>
                  </div>
                  <div>
                    <span className="font-semibold text-foreground">Blistering / Exudate:</span>{" "}
                    <span className="text-muted-foreground">{result.woundFeatures.blisteringOrExudate}</span>
                  </div>
                  <div>
                    <span className="font-semibold text-foreground">Margin Regularity:</span>{" "}
                    <span className="text-muted-foreground">{result.woundFeatures.margins}</span>
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border border-warning/30 bg-warning/5 p-4 space-y-2 text-xs">
                <h4 className="font-semibold text-warning-foreground flex items-center gap-2">
                  <AlertTriangle className="size-4 text-warning" />
                  Diagnostic Limitations of Photos
                </h4>
                <p className="text-muted-foreground leading-relaxed">
                  {result.woundFeatures.infectionUncertaintyNote}
                </p>
                {result.woundFeatures.burnDepthNote && (
                  <p className="text-muted-foreground leading-relaxed border-t border-warning/20 pt-2">
                    {result.woundFeatures.burnDepthNote}
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Follow-up Steps & Recommended Specialty */}
          <div className="rounded-2xl border border-primary/20 bg-primary/5 p-4 sm:p-5 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <span className="text-xs font-semibold uppercase tracking-wider text-primary">
                  Recommended Specialty
                </span>
                <p className="text-base font-bold text-foreground">
                  {result.suggestedSpecialty}
                </p>
              </div>

              <Link
                href={`/hospitals?specialty=${encodeURIComponent(result.suggestedSpecialty.split("/")[0].trim())}`}
                className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground shadow-xs hover:bg-primary/90"
              >
                <Stethoscope className="size-3.5" />
                Find Nearby Verified Specialists
                <ArrowRight className="size-3.5" />
              </Link>
            </div>

            <div className="border-t border-primary/10 pt-3">
              <h5 className="text-xs font-semibold text-foreground mb-2">
                Recommended Non-Prescriptive Next Steps:
              </h5>
              <ul className="space-y-1.5 text-xs text-muted-foreground">
                {result.recommendedFollowUps.map((step, idx) => (
                  <li key={idx} className="flex items-start gap-2">
                    <CheckCircle2 className="size-3.5 text-primary shrink-0 mt-0.5" />
                    <span>{step}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* Disclaimer */}
          <div className="rounded-xl border border-border bg-muted/40 p-3 text-[11px] leading-relaxed text-muted-foreground">
            {result.disclaimer}
          </div>

          {/* Action toolbar */}
          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={resetAll}
              className="inline-flex items-center gap-2 rounded-xl border border-border bg-background px-4 py-2 text-xs font-semibold text-foreground hover:bg-muted"
            >
              <RefreshCw className="size-3.5" />
              Start Another Analysis
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
