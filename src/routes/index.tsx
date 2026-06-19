import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CheckCircle2, Loader2, RotateCcw, ShieldCheck, TrendingUp } from "lucide-react";
import { analyzeFormUrl, type FormSignals } from "@/lib/analyze-form.functions";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Online Form UX Grader" },
      { name: "description", content: "Enter your form URL and see how much friction is costing your business." },
    ],
  }),
  component: Grader,
});

/* ---------------- Scoring engine (per spec) ---------------- */

type Recommendation = {
  title: string;
  impact: string;
  loss: number;
  priority: "CRITICAL" | "HIGH" | "MEDIUM";
  benchmark: string;
};

type PassingCheck = {
  title: string;
  detail: string;
};

type Report = {
  score: number;
  baselineRate: number;
  runningConvRate: number;
  currentAnnualRevenue: number;
  optimizedAnnualRevenue: number;
  totalTwelveMonthOpportunity: number;
  recommendations: Recommendation[];
  passingChecks: PassingCheck[];
  source: FormSignals["source"];
};

function computeReport(s: FormSignals, traffic: number, currentConvRate: number, leadValue: number): Report {
  const currentAnnualConversions = traffic * (currentConvRate / 100) * 12;
  const currentAnnualRevenue = currentAnnualConversions * leadValue;

  let score = 100;
  let runningConvRate = currentConvRate;
  let previousRevenue = currentAnnualRevenue;
  const recommendations: Recommendation[] = [];

  if (s.hasManualFirmographics) {
    score -= 25;
    runningConvRate = runningConvRate * 1.25;
    const stepRevenue = traffic * (runningConvRate / 100) * leadValue * 12;
    const lossDelta = stepRevenue - previousRevenue;
    previousRevenue = stepRevenue;
    recommendations.push({
      title: "Remove Manual Company Fields",
      impact: "+25% Conversion Lift",
      loss: lossDelta,
      priority: "CRITICAL",
      benchmark:
        "We've noticed your form asks users to manually fill in company information such as industry, company size, or job function. Research shows this inflates cost-per-lead by 25%. Auto-enrich this data from a user's corporate email instead — they'll never need to type it.",
    });
  }

  if (s.hasValidationIssue) {
    score -= 20;
    runningConvRate = runningConvRate * 1.22;
    const stepRevenue = traffic * (runningConvRate / 100) * leadValue * 12;
    const lossDelta = stepRevenue - previousRevenue;
    previousRevenue = stepRevenue;
    recommendations.push({
      title: "Add Inline Validation",
      impact: "+22% Conversion Lift",
      loss: lossDelta,
      priority: "HIGH",
      benchmark:
        "We've noticed your form has multiple fields but no inline validation feedback. Research shows that real-time field validation reduces form completion time by 42% and cuts user error loops by 22%. Add instant feedback as users type so they can correct mistakes without re-submitting.",
    });
  }

  if (s.hasSplitNames) {
    score -= 10;
    runningConvRate = runningConvRate * 1.05;
    const stepRevenue = traffic * (runningConvRate / 100) * leadValue * 12;
    const lossDelta = stepRevenue - previousRevenue;
    previousRevenue = stepRevenue;
    recommendations.push({
      title: "Merge Name Fields",
      impact: "+5% Conversion Lift",
      loss: lossDelta,
      priority: "MEDIUM",
      benchmark:
        "We've noticed your form asks for first name and last name in separate fields. Research shows that a single full-name field has the lowest friction and shortest completion time — averaging just 3.5 seconds. Merge them into one.",
    });
  }

  if (s.hasSalutation) {
    score -= 15;
    runningConvRate = runningConvRate * 1.06;
    const stepRevenue = traffic * (runningConvRate / 100) * leadValue * 12;
    const lossDelta = stepRevenue - previousRevenue;
    previousRevenue = stepRevenue;
    recommendations.push({
      title: "Remove the Salutation Dropdown",
      impact: "+6% Conversion Lift",
      loss: lossDelta,
      priority: "MEDIUM",
      benchmark:
        "We've noticed your form includes a salutation dropdown (Mr / Mrs / Ms / Dr). This field collects data you don't need and creates unnecessary friction right at the start of the form — one of the highest-abandonment points. Remove it entirely.",
    });
  }

  if (s.totalFieldCount > 5) {
    score -= Math.min((s.totalFieldCount - 5) * 5, 20);
    runningConvRate = runningConvRate * 1.10;
    const stepRevenue = traffic * (runningConvRate / 100) * leadValue * 12;
    const lossDelta = stepRevenue - previousRevenue;
    previousRevenue = stepRevenue;
    recommendations.push({
      title: "Reduce the Number of Fields",
      impact: "+10% Conversion Lift",
      loss: lossDelta,
      priority: "HIGH",
      benchmark:
        `We've noticed your form contains ${s.totalFieldCount} fields. Research shows that the average high-converting marketing form has around 5 fields, and excessive form length causes 27% of all abandonment. Trim to the essentials and enrich the rest with IP reveal or email lookup tools so users never have to fill in what you can find automatically.`,
    });
  }

  score = Math.max(0, score);
  if (runningConvRate > 66) runningConvRate = 66;

  const optimizedAnnualRevenue = traffic * (runningConvRate / 100) * leadValue * 12;
  const totalTwelveMonthOpportunity = optimizedAnnualRevenue - currentAnnualRevenue;
  recommendations.sort((a, b) => b.loss - a.loss);

  const passingChecks: PassingCheck[] = [];
  if (!s.hasSalutation) {
    passingChecks.push({
      title: "No title or salutation field",
      detail: "Your form doesn't ask users for their title or salutation — removing this unnecessary field speeds up completion and reduces early abandonment.",
    });
  }
  if (!s.hasSplitNames) {
    passingChecks.push({
      title: "Single full-name field",
      detail: "Your form collects a user's name in one field rather than separate first and last name inputs — the lowest-friction layout, with average completion times of just 3.5 seconds.",
    });
  }
  if (!s.hasManualFirmographics) {
    passingChecks.push({
      title: "No manual company data required",
      detail: "Your form doesn't ask users to fill in company size, industry, or job function manually — avoiding these fields keeps cost-per-lead down by up to 25%.",
    });
  }
  if (!s.hasValidationIssue) {
    passingChecks.push({
      title: "Inline validation present",
      detail: "Your form provides real-time validation feedback — this reduces completion time by 42% and cuts user error loops by 22%.",
    });
  }
  if (s.totalFieldCount <= 5) {
    passingChecks.push({
      title: `Lean field count (${s.totalFieldCount} fields)`,
      detail: `Your form has ${s.totalFieldCount} fields — right in the optimal range. Lean forms convert better and see significantly less abandonment.`,
    });
  }

  return {
    score,
    baselineRate: currentConvRate,
    runningConvRate,
    currentAnnualRevenue,
    optimizedAnnualRevenue,
    totalTwelveMonthOpportunity,
    recommendations,
    passingChecks,
    source: s.source,
  };
}

const fmt = (n: number) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

/* ---------------- Component ---------------- */

type Screen = "input" | "checklist" | "report";

type ChecklistAnswers = {
  hasSplitNames: boolean;
  hasSalutation: boolean;
  hasManualFirmographics: boolean;
  hasInlineValidation: boolean;
  totalFieldCount: string;
};

function Grader() {
  const analyze = useServerFn(analyzeFormUrl);
  const [screen, setScreen] = useState<Screen>("input");
  const [url, setUrl] = useState("");
  const [traffic, setTraffic] = useState<string>("");
  const [rate, setRate] = useState<string>("");
  const [value, setValue] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [report, setReport] = useState<Report | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [storedMetrics, setStoredMetrics] = useState({ t: 100000, r: 2.5, v: 150 });

  const onAnalyze = async () => {
    if (!url.trim()) {
      setError("Please enter a URL");
      return;
    }
    setError(null);
    setLoading(true);
    const t = Number(traffic) || 100000;
    const r = Number(rate) || 2.5;
    const v = Number(value) || 150;
    setStoredMetrics({ t, r, v });

    const minDelay = new Promise((res) => setTimeout(res, 2500));
    try {
      const [signals] = await Promise.all([analyze({ data: { url } }), minDelay]);
      if (signals.source === "structural-benchmark") {
        setScreen("checklist");
      } else {
        setReport(computeReport(signals, t, r, v));
        setScreen("report");
      }
    } catch {
      setScreen("checklist");
    } finally {
      setLoading(false);
    }
  };

  const onChecklistSubmit = (answers: ChecklistAnswers) => {
    const { t, r, v } = storedMetrics;
    const fieldCount = Math.max(1, Number(answers.totalFieldCount) || 1);
    const signals: FormSignals = {
      hasSplitNames: answers.hasSplitNames,
      hasSalutation: answers.hasSalutation,
      hasManualFirmographics: answers.hasManualFirmographics,
      hasValidationIssue: fieldCount >= 3 && !answers.hasInlineValidation,
      totalFieldCount: fieldCount,
      source: "manual-checklist",
    };
    setReport(computeReport(signals, t, r, v));
    setScreen("report");
  };

  const reset = () => {
    setReport(null);
    setUrl("");
    setTraffic("");
    setRate("");
    setValue("");
    setScreen("input");
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-6xl mx-auto px-6 py-12 md:py-16">
        {screen === "input" && (
          <InputScreen
            url={url} setUrl={setUrl}
            traffic={traffic} setTraffic={setTraffic}
            rate={rate} setRate={setRate}
            value={value} setValue={setValue}
            onAnalyze={onAnalyze}
            error={error}
          />
        )}
        {screen === "checklist" && (
          <ChecklistScreen
            onSubmit={onChecklistSubmit}
            onBack={() => setScreen("input")}
          />
        )}
        {screen === "report" && report && (
          <ReportScreen report={report} reset={reset} />
        )}
      </div>
      {loading && <LoadingOverlay />}
    </div>
  );
}

/* ---------------- Checklist screen ---------------- */

const CHECKLIST_QUESTIONS: { key: keyof Omit<ChecklistAnswers, "totalFieldCount">; label: string }[] = [
  { key: "hasSplitNames", label: "Does your form split names into separate First Name and Last Name fields?" },
  { key: "hasSalutation", label: "Does your form include a salutation or title dropdown (Mr / Mrs / Ms / Dr)?" },
  { key: "hasManualFirmographics", label: "Does your form ask users to manually fill in company details (e.g. industry, company size, job function)?" },
  { key: "hasInlineValidation", label: "Does your form show real-time validation feedback as users type (e.g. required markers, inline error messages)?" },
];

function ChecklistScreen({ onSubmit, onBack }: { onSubmit: (a: ChecklistAnswers) => void; onBack: () => void }) {
  const [answers, setAnswers] = useState<ChecklistAnswers>({
    hasSplitNames: false,
    hasSalutation: false,
    hasManualFirmographics: false,
    hasInlineValidation: true,
    totalFieldCount: "",
  });

  const set = (key: keyof Omit<ChecklistAnswers, "totalFieldCount">, val: boolean) =>
    setAnswers((prev) => ({ ...prev, [key]: val }));

  return (
    <div className="animate-in fade-in duration-500">
      <header className="max-w-3xl mb-10">
        <div className="text-xs uppercase tracking-[0.25em] text-burgundy/70 font-semibold mb-4">
          Contentsquare · Form UX Audit
        </div>
        <h1 className="text-4xl md:text-5xl font-bold text-burgundy leading-[1.05]">
          We couldn't access your form
        </h1>
        <p className="mt-4 text-lg text-foreground/80 leading-relaxed">
          Some sites block automated scraping. Answer these 5 quick questions and we'll calculate your audit instantly.
        </p>
      </header>

      <div className="max-w-2xl space-y-3">
        {CHECKLIST_QUESTIONS.map((q) => (
          <div key={q.key} className="bg-card border border-border rounded-2xl p-5 shadow-sm flex items-center justify-between gap-6">
            <p className="text-sm font-medium text-foreground/90 leading-relaxed">{q.label}</p>
            <div className="shrink-0 flex gap-2">
              {([true, false] as const).map((val) => (
                <button
                  key={String(val)}
                  onClick={() => set(q.key, val)}
                  className={`px-4 py-2 rounded-full text-sm font-semibold border transition-colors ${
                    answers[q.key] === val
                      ? "bg-burgundy text-white border-burgundy"
                      : "bg-background text-muted-foreground border-border hover:border-burgundy/40"
                  }`}
                >
                  {val ? "Yes" : "No"}
                </button>
              ))}
            </div>
          </div>
        ))}

        <div className="bg-card border border-border rounded-2xl p-5 shadow-sm">
          <p className="text-sm font-medium text-foreground/90 mb-3">How many visible fields does your form have?</p>
          <Input
            type="text"
            inputMode="numeric"
            value={answers.totalFieldCount}
            onChange={(e) => setAnswers((prev) => ({ ...prev, totalFieldCount: e.target.value.replace(/[^0-9]/g, "") }))}
            placeholder="e.g. 4"
            className="h-12 max-w-[120px] bg-background/60 border-border focus-visible:ring-burgundy/40"
          />
        </div>
      </div>

      <div className="flex items-center gap-6 mt-8">
        <Button
          size="lg"
          onClick={() => onSubmit(answers)}
          disabled={!answers.totalFieldCount}
          className="h-14 px-10 text-base font-semibold rounded-full bg-burgundy text-white hover:bg-burgundy/90 shadow-md hover:shadow-lg transition-all disabled:opacity-50"
        >
          Generate My Audit →
        </Button>
        <button
          onClick={onBack}
          className="text-sm text-burgundy hover:text-burgundy/70 underline underline-offset-4 inline-flex items-center gap-2"
        >
          <RotateCcw className="w-3.5 h-3.5" /> Try a different URL
        </button>
      </div>
    </div>
  );
}

/* ---------------- Input screen ---------------- */

function InputScreen(props: {
  url: string; setUrl: (s: string) => void;
  traffic: string; setTraffic: (s: string) => void;
  rate: string; setRate: (s: string) => void;
  value: string; setValue: (s: string) => void;
  onAnalyze: () => void;
  error: string | null;
}) {
  const { url, setUrl, traffic, setTraffic, rate, setRate, value, setValue, onAnalyze, error } = props;
  return (
    <div>
      <header className="max-w-3xl mb-12">
        <div className="text-xs uppercase tracking-[0.25em] text-burgundy/70 font-semibold mb-4">
          Contentsquare · Form UX Audit
        </div>
        <h1 className="text-5xl md:text-6xl font-bold text-burgundy leading-[1.05]">
          Online Form UX Grader
        </h1>
        <p className="mt-5 text-lg text-foreground/80 leading-relaxed">
          Enter the URL where users contact you, sign up to your product or request a demo to
          evaluate the UX friction present and how much it could be costing your business.
          Based on industry research and benchmarks.
        </p>
      </header>

      <div className="grid lg:grid-cols-2 gap-6">
        <section className="bg-card border border-border rounded-2xl p-8 shadow-sm">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-xs font-bold text-burgundy/70 tracking-wider">1.</span>
            <h2 className="text-xl font-bold text-burgundy">Your Form URL</h2>
          </div>
          <p className="text-sm text-muted-foreground mb-5">
            Paste the page where your form lives — signup, demo request, contact, checkout.
          </p>
          <Input
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://yourwebsite.com/signup"
            className="h-14 text-base bg-background/60 border-border focus-visible:ring-burgundy/40"
          />
          {error && <p className="text-sm text-destructive mt-2">{error}</p>}
        </section>

        <section className="bg-card border border-border rounded-2xl p-8 shadow-sm">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-xs font-bold text-burgundy/70 tracking-wider">2.</span>
            <h2 className="text-xl font-bold text-burgundy">Business Metrics</h2>
            <span className="ml-2 text-xs text-muted-foreground">(Optional)</span>
          </div>
          <p className="text-sm text-muted-foreground mb-5">
            Leave blank to use industry standard defaults.
          </p>
          <div className="space-y-4">
            <MetricField label="Monthly Website Traffic" placeholder="100,000" value={traffic} onChange={setTraffic} />
            <MetricField label="Current Form Conversion Rate (%)" placeholder="2.5" value={rate} onChange={setRate} />
            <MetricField label="Average Lead Value or Order Value ($)" placeholder="150" value={value} onChange={setValue} />
          </div>
        </section>
      </div>

      <div className="flex justify-center mt-10">
        <Button
          size="lg"
          onClick={onAnalyze}
          className="h-14 px-10 text-base font-semibold rounded-full bg-burgundy text-white hover:bg-burgundy/90 shadow-md hover:shadow-lg transition-all"
        >
          Analyze Form Friction →
        </Button>
      </div>
    </div>
  );
}

function MetricField({
  label, placeholder, value, onChange,
}: { label: string; placeholder: string; value: string; onChange: (s: string) => void }) {
  return (
    <div>
      <label className="text-sm font-medium text-foreground/80 mb-1.5 block">{label}</label>
      <Input
        type="text"
        inputMode="decimal"
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/[^0-9.]/g, ""))}
        placeholder={placeholder}
        className="h-12 bg-background/60 border-border focus-visible:ring-burgundy/40"
      />
    </div>
  );
}

/* ---------------- Loading overlay ---------------- */

function LoadingOverlay() {
  const messages = [
    "Fetching URL headers...",
    "Locating form DOM elements...",
    "Analyzing field validation structures...",
  ];
  const [i, setI] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setI((x) => (x + 1) % messages.length), 800);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="fixed inset-0 z-50 bg-background/95 backdrop-blur-sm flex items-center justify-center">
      <div className="text-center">
        <div className="relative w-40 h-40 mx-auto">
          <div className="absolute inset-0 rounded-full border-2 border-burgundy/20" />
          <div className="absolute inset-3 rounded-full border border-burgundy/15" />
          <div className="absolute inset-6 rounded-full border border-burgundy/10" />
          <div className="absolute inset-0 radar rounded-full" />
          <div className="absolute inset-0 flex items-center justify-center">
            <Loader2 className="w-7 h-7 text-burgundy animate-spin" />
          </div>
        </div>
        <div className="mt-8 text-burgundy font-semibold text-lg min-h-[28px]">{messages[i]}</div>
        <div className="mt-1 text-xs uppercase tracking-[0.25em] text-muted-foreground">Auditing your form</div>
      </div>
    </div>
  );
}

/* ---------------- Report screen ---------------- */

function ReportScreen({ report, reset }: { report: Report; reset: () => void }) {
  return (
    <div className="space-y-10 animate-in fade-in duration-500">
      <header>
        <div className="text-xs uppercase tracking-[0.25em] text-burgundy/70 font-semibold mb-3">
          Audit complete
        </div>
        <h1 className="text-4xl md:text-5xl font-bold text-burgundy">Your Form Audit Results</h1>
        {report.source === "manual-checklist" && (
          <div className="inline-flex items-center gap-2 mt-4 px-3 py-1.5 rounded-full bg-burgundy/8 border border-burgundy/20 text-xs text-burgundy">
            <ShieldCheck className="w-3.5 h-3.5" />
            Analysis based on your answers.
          </div>
        )}
      </header>

      {/* Hero banner */}
      <div className="bg-card border border-border rounded-3xl p-8 md:p-10 shadow-sm">
        <div className="grid md:grid-cols-[auto_1fr] gap-10 items-start">
          <ScoreGauge score={report.score} />
          <div>
            <div className="text-sm uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-gain" />
              Total 12-Month Revenue Opportunity
            </div>
            <Counter value={report.totalTwelveMonthOpportunity} />
            <div className="mt-4 text-sm text-foreground/70">
              Projected Conversion Rate:{" "}
              <span className="font-semibold text-foreground">{report.runningConvRate.toFixed(2)}%</span>{" "}
              <span className="text-muted-foreground">(Baseline: {report.baselineRate.toFixed(2)}%)</span>
            </div>
            <div className="mt-1 text-xs text-muted-foreground">
              Current annual revenue: <span className="font-mono">{fmt(report.currentAnnualRevenue)}</span> →
              Optimized: <span className="font-mono text-gain">{fmt(report.optimizedAnnualRevenue)}</span>
            </div>
            <div className="mt-6 pt-6 border-t border-border">
              <p className="text-sm text-foreground/80 leading-relaxed mb-4">
                Use <span className="font-bold text-burgundy">Contentsquare's Experience Analytics</span> suite
                to uncover friction points in your user's journey with heatmaps, session replays and
                intelligent friction scores.
              </p>
              <form onSubmit={(e) => e.preventDefault()} className="flex flex-col sm:flex-row gap-3">
                <Input
                  type="email"
                  required
                  placeholder="Work email (eg lidia.infante@contentsquare.com)"
                  className="h-11 flex-1 bg-background/60 border-border focus-visible:ring-burgundy/40"
                />
                <Button
                  type="submit"
                  className="h-11 px-5 rounded-full bg-burgundy text-white hover:bg-burgundy/90 font-semibold shadow-md whitespace-nowrap"
                >
                  Claim Your Free 14-Day Trial
                </Button>
              </form>
            </div>
          </div>
        </div>
      </div>

      {/* Roadmap */}
      <section>
        <h2 className="text-2xl font-bold text-burgundy mb-5">Prioritized Optimization Roadmap</h2>
        {report.recommendations.length === 0 ? (
          <div className="bg-card border border-border rounded-2xl p-8 text-center text-muted-foreground">
            No major friction patterns detected. Your form is already leaner than most.
          </div>
        ) : (
          <div className="space-y-4">
            {report.recommendations.map((r, i) => (
              <RecommendationCard key={i} rec={r} />
            ))}
          </div>
        )}
      </section>

      {/* Passing checks */}
      {(report.passingChecks?.length ?? 0) > 0 && (
        <section>
          <h2 className="text-2xl font-bold text-burgundy mb-5">What Your Form Is Already Doing Right</h2>
          <div className="space-y-3">
            {(report.passingChecks ?? []).map((c, i) => (
              <PassingCheckCard key={i} check={c} />
            ))}
          </div>
        </section>
      )}

      {/* CTA */}
      <footer className="rounded-3xl border-2 border-burgundy/30 bg-secondary/50 p-8 md:p-10">
        <p className="text-foreground/90 text-lg leading-relaxed max-w-3xl">
          Use <span className="font-bold text-burgundy">Contentsquare's Experience Analytics</span> suite
          to uncover friction points in your user's journey with heatmaps, session replays and
          intelligent friction scores.
        </p>
        <form
          onSubmit={(e) => e.preventDefault()}
          className="mt-6 flex flex-col sm:flex-row gap-3 max-w-2xl"
        >
          <Input
            type="email"
            required
            placeholder="Work email (eg lidia.infante@contentsquare.com)"
            className="h-12 flex-1 bg-card border-border focus-visible:ring-burgundy/40"
          />
          <Button
            type="submit"
            className="h-12 px-6 rounded-full bg-burgundy text-white hover:bg-burgundy/90 font-semibold shadow-md"
          >
            Claim Your Free 14-Day Trial
          </Button>
        </form>
      </footer>

      <div className="flex justify-center pt-2 pb-6">
        <button
          onClick={reset}
          className="text-sm text-burgundy hover:text-burgundy/70 underline underline-offset-4 inline-flex items-center gap-2"
        >
          <RotateCcw className="w-3.5 h-3.5" /> Reset Grader
        </button>
      </div>
    </div>
  );
}

function ScoreGauge({ score }: { score: number }) {
  const R = 70;
  const C = 2 * Math.PI * R;
  const offset = C - (score / 100) * C;
  const color = score >= 75 ? "var(--gain)" : score >= 45 ? "var(--warn)" : "var(--burgundy)";
  return (
    <div className="relative w-[180px] h-[180px] mx-auto">
      <svg viewBox="0 0 160 160" className="w-full h-full -rotate-90">
        <circle cx="80" cy="80" r={R} stroke="var(--border)" strokeWidth="12" fill="none" />
        <circle
          cx="80" cy="80" r={R}
          stroke={color}
          strokeWidth="12"
          strokeLinecap="round"
          strokeDasharray={C}
          strokeDashoffset={offset}
          fill="none"
          style={{ transition: "stroke-dashoffset 1.2s ease-out" }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <div className="font-display text-5xl font-bold" style={{ color }}>{score}</div>
        <div className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground mt-1">UX Score / 100</div>
      </div>
    </div>
  );
}

function Counter({ value }: { value: number }) {
  const [n, setN] = useState(0);
  useMemo(() => {
    const start = performance.now();
    const dur = 1400;
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / dur);
      const eased = 1 - Math.pow(1 - p, 3);
      setN(value * eased);
      if (p < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }, [value]);
  return (
    <div className="font-display font-extrabold text-5xl md:text-6xl tracking-tight tabular-nums" style={{ color: "var(--gain)" }}>
      {fmt(n)}
    </div>
  );
}

function RecommendationCard({ rec }: { rec: Recommendation }) {
  const priorityClasses =
    rec.priority === "CRITICAL"
      ? "bg-orange-100 text-orange-700 border-orange-300"
      : rec.priority === "HIGH"
      ? "bg-orange-50 text-orange-600 border-orange-200"
      : "bg-amber-50 text-amber-700 border-amber-200";

  return (
    <div className="bg-card border border-border rounded-2xl p-6 md:p-7 shadow-sm hover:shadow-md transition-shadow">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
        <span className={`text-[10px] font-bold uppercase tracking-[0.18em] px-2.5 py-1 rounded-full border ${priorityClasses}`}>
          {rec.priority}
        </span>
        <span className="inline-flex items-center gap-2 text-xs px-3 py-1 rounded-full bg-burgundy/8 text-burgundy border border-burgundy/15 font-medium">
          Estimated Impact: {rec.impact}
        </span>
      </div>
      <h3 className="text-xl font-bold text-burgundy mb-3">{rec.title}</h3>
      <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-green-50 border border-green-300 text-sm font-semibold mb-4" style={{ color: "var(--gain)" }}>
        Estimated 12-Month Revenue Lost: {fmt(rec.loss)}
      </div>
      <p className="text-sm text-foreground/75 leading-relaxed">{rec.benchmark}</p>
    </div>
  );
}

function PassingCheckCard({ check }: { check: PassingCheck }) {
  return (
    <div className="bg-card border border-border rounded-2xl p-5 md:p-6 shadow-sm flex items-start gap-4">
      <CheckCircle2 className="w-5 h-5 mt-0.5 shrink-0 text-gain" />
      <div>
        <h3 className="font-semibold text-foreground mb-1">{check.title}</h3>
        <p className="text-sm text-foreground/70 leading-relaxed">{check.detail}</p>
      </div>
    </div>
  );
}
