"use client";
// app/activate/page.tsx
import React, { useState, useEffect, useCallback } from "react";
import {
  ActivationRequestAPI,
  ActivationRequestPayload,
  ApiError,
} from "@/lib/api";

/* ═══════════════════════════════════════════════════════════════
   ASSESSMENT ENGINE — ported from assessment_engine.js
═══════════════════════════════════════════════════════════════ */
const CONFIG = {
  plans: [
    {
      name: "Quick Liquidation",
      units_min: 1,
      units_max: 10,
      base_investment_lower: 125000,
      validity_months: 1,
      l1_cp_range: [4, 6],
      l2_cp_range: [8, 12],
    },
    {
      name: "Focused Closure",
      units_min: 11,
      units_max: 30,
      base_investment_lower: 325000,
      validity_months: 3,
      l1_cp_range: [6, 10],
      l2_cp_range: [15, 22],
    },
    {
      name: "Sales Acceleration",
      units_min: 31,
      units_max: 75,
      base_investment_lower: 750000,
      validity_months: 6,
      l1_cp_range: [10, 16],
      l2_cp_range: [24, 36],
    },
    {
      name: "Growth Distribution",
      units_min: 76,
      units_max: 200,
      base_investment_lower: 1400000,
      validity_months: 12,
      l1_cp_range: [14, 22],
      l2_cp_range: [35, 55],
    },
    {
      name: "Full Distribution",
      units_min: 201,
      units_max: 500,
      base_investment_lower: 2000000,
      validity_months: 12,
      l1_cp_range: [20, 32],
      l2_cp_range: [60, 90],
    },
    {
      name: "Enterprise Distribution",
      units_min: 501,
      units_max: 1000000,
      base_investment_lower: 3500000,
      validity_months: 24,
      l1_cp_range: [30, 50],
      l2_cp_range: [90, 140],
    },
  ],
  location_strength: {
    prime: {
      price_multiplier: 1.2,
      l1_multiplier: 1.2,
      l2_multiplier: 0.9,
      sessions_per_closure: 7,
      lead_to_session_ratio: 1.7,
      timeline_multiplier: 1.0,
      description:
        "Curated, specialist-led activation with metro and premium buyer pull.",
    },
    established: {
      price_multiplier: 1.1,
      l1_multiplier: 1.0,
      l2_multiplier: 1.0,
      sessions_per_closure: 9,
      lead_to_session_ratio: 2.0,
      timeline_multiplier: 1.0,
      description:
        "Balanced activation across specialist and broad CP network.",
    },
    developing: {
      price_multiplier: 1.0,
      l1_multiplier: 0.9,
      l2_multiplier: 1.15,
      sessions_per_closure: 12,
      lead_to_session_ratio: 2.2,
      timeline_multiplier: 1.1,
      description: "Requires broader distribution and more follow-up effort.",
    },
    remote: {
      price_multiplier: 0.95,
      l1_multiplier: 0.8,
      l2_multiplier: 1.25,
      sessions_per_closure: 15,
      lead_to_session_ratio: 2.5,
      timeline_multiplier: 1.2,
      description: "Higher distribution effort and longer conversion cycle.",
    },
  },
  sales_velocity: {
    fast: { price_multiplier: 0.95, timeline_multiplier: 0.9 },
    moderate: { price_multiplier: 1.0, timeline_multiplier: 1.0 },
    slow: { price_multiplier: 1.1, timeline_multiplier: 1.1 },
    stuck: { price_multiplier: 1.2, timeline_multiplier: 1.25 },
  },
  city_source_map: {
    pune: {
      cp_supply_cities: ["Pune", "Mumbai", "Thane", "Navi Mumbai"],
      buyer_source_cities: ["Pune", "Mumbai", "Thane", "Navi Mumbai", "Nashik"],
    },
    mumbai: {
      cp_supply_cities: ["Mumbai", "Thane", "Navi Mumbai", "Pune"],
      buyer_source_cities: [
        "Mumbai",
        "Thane",
        "Navi Mumbai",
        "Pune",
        "Ahmedabad",
      ],
    },
    bangalore: {
      cp_supply_cities: ["Bengaluru", "Mumbai", "Hyderabad", "Chennai"],
      buyer_source_cities: ["Bengaluru", "Hyderabad", "Chennai", "Mumbai"],
    },
    hyderabad: {
      cp_supply_cities: ["Hyderabad", "Bengaluru", "Mumbai", "Pune"],
      buyer_source_cities: ["Hyderabad", "Bengaluru", "Mumbai", "Pune"],
    },
    delhi: {
      cp_supply_cities: ["Delhi NCR", "Gurugram", "Noida", "Ghaziabad"],
      buyer_source_cities: [
        "Delhi NCR",
        "Gurugram",
        "Noida",
        "Faridabad",
        "Ghaziabad",
      ],
    },
    gurugram: {
      cp_supply_cities: ["Delhi NCR", "Gurugram", "Noida", "Ghaziabad"],
      buyer_source_cities: [
        "Delhi NCR",
        "Gurugram",
        "Noida",
        "Faridabad",
        "Ghaziabad",
      ],
    },
    noida: {
      cp_supply_cities: ["Delhi NCR", "Noida", "Gurugram", "Ghaziabad"],
      buyer_source_cities: [
        "Delhi NCR",
        "Noida",
        "Gurugram",
        "Faridabad",
        "Ghaziabad",
      ],
    },
    dubai: {
      cp_supply_cities: ["Dubai", "Mumbai", "Delhi NCR", "Hyderabad"],
      buyer_source_cities: [
        "Mumbai",
        "Delhi NCR",
        "Hyderabad",
        "Bengaluru",
        "Ahmedabad",
      ],
    },
    default: {
      cp_supply_cities: ["Local City", "Nearby Metro", "Regional Hub"],
      buyer_source_cities: ["Local City", "Nearby Metro", "Regional Hub"],
    },
  },
};

function roundToNearest(value: number, nearest: number) {
  return Math.round(value / nearest) * nearest;
}
function formatInrLakh(value: number) {
  const lakh = value / 100000;
  return `₹${lakh.toFixed(2)}L`;
}

interface AssessmentInput {
  project_name: string;
  city: string;
  units_left: number;
  location_strength: string;
  sales_velocity: string;
  target_timeline_months: number;
}
interface AssessmentResult {
  plan: { name: string; validity_months: number; validity_label: string };
  investment: {
    lower: number;
    upper: number;
    lower_label: string;
    upper_label: string;
    range_label: string;
  };
  assessment: {
    primary_activation_layer: {
      cp_count_min: number;
      cp_count_max: number;
      cp_count_label: string;
      descriptor: string;
    };
    secondary_distribution_layer: {
      cp_count_min: number;
      cp_count_max: number;
      cp_count_label: string;
      descriptor: string;
    };
    demand_engine: {
      matchmaking_sessions_needed: number;
      leads_needed: number;
    };
    execution: { boost_cycles: number; spike_campaigns: number };
    support_geography: {
      cp_supply_cities: string[];
      buyer_source_cities: string[];
    };
  };
  location_description: string;
}

function buildAssessment(input: AssessmentInput): AssessmentResult | null {
  const plan = CONFIG.plans.find(
    (p) => input.units_left >= p.units_min && input.units_left <= p.units_max,
  );
  if (!plan) return null;
  const locKey = (
    input.location_strength || "established"
  ).toLowerCase() as keyof typeof CONFIG.location_strength;
  const velKey = (
    input.sales_velocity || "moderate"
  ).toLowerCase() as keyof typeof CONFIG.sales_velocity;
  const locRule =
    CONFIG.location_strength[locKey] || CONFIG.location_strength.established;
  const velRule =
    CONFIG.sales_velocity[velKey] || CONFIG.sales_velocity.moderate;
  const cityKey = (
    input.city || ""
  ).toLowerCase() as keyof typeof CONFIG.city_source_map;
  const cityMap =
    CONFIG.city_source_map[cityKey] || CONFIG.city_source_map.default;
  let validityMonths = Math.ceil(
    plan.validity_months *
      locRule.timeline_multiplier *
      velRule.timeline_multiplier,
  );
  if (input.target_timeline_months && input.target_timeline_months > 0)
    validityMonths = Math.max(
      validityMonths,
      Math.ceil(input.target_timeline_months),
    );
  const lowerRaw =
    plan.base_investment_lower *
    locRule.price_multiplier *
    velRule.price_multiplier;
  const lower = roundToNearest(lowerRaw, 5000);
  const upper = roundToNearest(lower * 1.5, 5000);
  return {
    plan: {
      name: plan.name,
      validity_months: validityMonths,
      validity_label:
        validityMonths === 1 ? "1 Month" : `${validityMonths} Months`,
    },
    investment: {
      lower,
      upper,
      lower_label: formatInrLakh(lower),
      upper_label: formatInrLakh(upper),
      range_label: `${formatInrLakh(lower)} – ${formatInrLakh(upper)}`,
    },
    assessment: {
      primary_activation_layer: {
        cp_count_min: Math.round(plan.l1_cp_range[0] * locRule.l1_multiplier),
        cp_count_max: Math.round(plan.l1_cp_range[1] * locRule.l1_multiplier),
        cp_count_label: `${Math.round(plan.l1_cp_range[0] * locRule.l1_multiplier)}–${Math.round(plan.l1_cp_range[1] * locRule.l1_multiplier)}`,
        descriptor: "Verified CPs with priority push and direct showcase",
      },
      secondary_distribution_layer: {
        cp_count_min: Math.round(plan.l2_cp_range[0] * locRule.l2_multiplier),
        cp_count_max: Math.round(plan.l2_cp_range[1] * locRule.l2_multiplier),
        cp_count_label: `${Math.round(plan.l2_cp_range[0] * locRule.l2_multiplier)}–${Math.round(plan.l2_cp_range[1] * locRule.l2_multiplier)}`,
        descriptor: "Suggested-tag visibility for broader aligned distribution",
      },
      demand_engine: {
        matchmaking_sessions_needed: Math.ceil(
          input.units_left * locRule.sessions_per_closure,
        ),
        leads_needed: Math.ceil(
          Math.ceil(input.units_left * locRule.sessions_per_closure) *
            locRule.lead_to_session_ratio,
        ),
      },
      execution: {
        boost_cycles: Math.max(1, Math.ceil(validityMonths / 2)),
        spike_campaigns: Math.max(1, Math.ceil(validityMonths / 4)),
      },
      support_geography: {
        cp_supply_cities: cityMap.cp_supply_cities,
        buyer_source_cities: cityMap.buyer_source_cities,
      },
    },
    location_description: locRule.description,
  };
}

/* ═══════════════════════════════════════════════════════════════
   CONSTANTS
═══════════════════════════════════════════════════════════════ */
const UNITS_LEFT_OPTIONS = [
  { label: "1 – 10", value: 5 },
  { label: "11 – 30", value: 20 },
  { label: "31 – 75", value: 50 },
  { label: "76 – 200", value: 130 },
  { label: "200 – 500", value: 350 },
  { label: "500+", value: 750 },
];
const CITIES = [
  "Pune",
  "Mumbai",
  "Bangalore",
  "Hyderabad",
  "Delhi",
  "Gurugram",
  "Noida",
  "Dubai",
  "Other",
];
const PRICE_RANGES = [
  "< ₹50L",
  "₹50L – ₹1.5Cr",
  "₹1.5Cr – ₹3Cr",
  "₹3Cr – ₹5Cr",
  "₹5Cr – ₹10Cr",
  "₹10Cr+",
];
const LOCATION_TYPES = ["Prime", "Established", "Developing", "Remote"];
const UNIT_STRUCTURES = ["Single Type", "Few Variants", "Multiple Variants"];
const BUYER_TYPES = ["Local", "Outstation", "Pan India", "NRI"];
const SALES_VELOCITIES = ["Fast", "Moderate", "Slow", "Stuck"];
const DEVELOPER_POSITIONS = ["Tier 1", "Known", "Emerging"];
const LOADING_MESSAGES = [
  "Analyzing market positioning…",
  "Evaluating conectr fit…",
  "Estimating distribution effort…",
  "Preparing activation plan…",
];

/* ── Chip: themed text/border, orange when selected ── */
function Chip({
  label,
  selected,
  onClick,
}: {
  label: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        padding: "10px 18px",
        borderRadius: 12,
        cursor: "pointer",
        fontSize: "0.82rem",
        fontWeight: 600,
        fontFamily: "var(--font-body)",
        background: selected
          ? "linear-gradient(135deg, rgba(249,115,22,0.18), rgba(249,115,22,0.08))"
          : "rgba(255,255,255,0.82)",
        border: selected
          ? "1.5px solid var(--orange-500)"
          : "1.5px solid var(--color-border)",
        color: selected ? "var(--orange-700)" : "var(--color-text-primary)",
        boxShadow: selected ? "0 0 12px rgba(249,115,22,0.15)" : "none",
        transition: "all 0.2s",
        userSelect: "none" as const,
      }}
    >
      {label}
    </button>
  );
}

/* ═══════════════════════════════════════════════════════════════
   PAGE
═══════════════════════════════════════════════════════════════ */
export default function ActivateProjectPage() {
  const [step, setStep] = useState(1);
  const [form, setForm] = useState({
    project_name: "",
    city: "",
    google_location: "",
    units_left_label: "",
    units_left: 0,
    possession_date: "",
    price_range: "",
    location_type: "",
    unit_structure: "",
    buyer_type: "",
    sales_velocity: "",
    target_timeline: "",
    developer_positioning: "",
    contact_name: "",
    designation: "",
    phone: "",
    email: "",
    developer_name: "",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState("");
  const [assessment, setAssessment] = useState<AssessmentResult | null>(null);
  const [loadingMsg, setLoadingMsg] = useState(0);
  const [submitting, setSubmitting] = useState(false);

  const set = (k: string, v: string | number) => {
    setForm((p) => ({ ...p, [k]: v }));
    setErrors((p) => {
      const n = { ...p };
      delete n[k];
      return n;
    });
  };

  const ErrorMsg = ({ field }: { field: string }) =>
    errors[field] ? (
      <p style={{ color: "var(--red-600)", fontSize: "0.72rem", marginTop: 4 }}>
        {errors[field]}
      </p>
    ) : null;

  const validateStep1 = () => {
    const e: Record<string, string> = {};
    if (!form.project_name.trim()) e.project_name = "Required";
    if (!form.city) e.city = "Required";
    if (!form.units_left) e.units_left_label = "Required";
    setErrors(e);
    return !Object.keys(e).length;
  };
  const validateStep2 = () => {
    const e: Record<string, string> = {};
    if (!form.price_range) e.price_range = "Required";
    if (!form.location_type) e.location_type = "Required";
    if (!form.unit_structure) e.unit_structure = "Required";
    setErrors(e);
    return !Object.keys(e).length;
  };
  const validateStep3 = () => {
    const e: Record<string, string> = {};
    if (!form.sales_velocity) e.sales_velocity = "Required";
    setErrors(e);
    return !Object.keys(e).length;
  };
  const validateStep7 = () => {
    const e: Record<string, string> = {};
    if (!form.contact_name.trim()) e.contact_name = "Required";
    if (!form.phone.match(/^\d{10}$/))
      e.phone = "Valid 10-digit number required";
    if (!form.email.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/))
      e.email = "Valid email required";
    if (!form.developer_name.trim()) e.developer_name = "Required";
    setErrors(e);
    return !Object.keys(e).length;
  };

  const generateAssessment = useCallback(() => {
    const locMap: Record<string, string> = {
      Prime: "prime",
      Established: "established",
      Developing: "developing",
      Remote: "remote",
    };
    const velMap: Record<string, string> = {
      Fast: "fast",
      Moderate: "moderate",
      Slow: "slow",
      Stuck: "stuck",
    };
    return buildAssessment({
      project_name: form.project_name,
      city: form.city,
      units_left: form.units_left,
      location_strength: locMap[form.location_type] || "established",
      sales_velocity: velMap[form.sales_velocity] || "moderate",
      target_timeline_months: parseInt(form.target_timeline) || 0,
    });
  }, [form]);

  useEffect(() => {
    if (step !== 4) return;
    let idx = 0;
    setLoadingMsg(0);
    const interval = setInterval(() => {
      idx++;
      if (idx < LOADING_MESSAGES.length) {
        setLoadingMsg(idx);
      } else {
        clearInterval(interval);
        setAssessment(generateAssessment());
        setStep(5);
      }
    }, 700);
    return () => clearInterval(interval);
  }, [step, generateAssessment]);

  const goNext = () => {
    if (step === 1 && !validateStep1()) return;
    if (step === 2 && !validateStep2()) return;
    if (step === 3 && !validateStep3()) return;
    if (step === 7) {
      if (!validateStep7()) return;
      handleSubmit();
      return;
    }
    setStep((s) => s + 1);
    setErrors({});
  };
  const goBack = () => {
    if (step > 1 && step !== 4 && step !== 8) setStep((s) => s - 1);
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    setSubmitError("");
    const payload: ActivationRequestPayload = {
      ...form,
      assessment: assessment ? JSON.stringify(assessment) : null,
      submitted_at: new Date().toISOString(),
    };
    const token = localStorage.getItem("cp_token");

    try {
      try {
        await ActivationRequestAPI.create(payload, token);
      } catch (err) {
        const e = err as ApiError;
        if (e.status === 401 && token) {
          await ActivationRequestAPI.create(payload, null);
        } else {
          throw err;
        }
      }

      setStep(8);
    } catch (err) {
      const e = err as ApiError;
      setSubmitError(
        e.message || "Network error. Please check connection and try again.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  const progressSteps =
    step <= 3 ? step : step === 4 ? 3 : step <= 6 ? 4 : step === 7 ? 5 : 6;

  /* ── Dark result card styles (steps 5 & 6) ── */
  const rCard: React.CSSProperties = {
    border: "1px solid var(--navy-900)",
    borderRadius: 16,
    padding: 20,
    margin: 16,
  };
  const rTitle: React.CSSProperties = {
    fontFamily: "var(--font-display)",
    fontSize: "0.78rem",
    fontWeight: 700,
    textTransform: "uppercase" as const,
    letterSpacing: "0.1em",
    color: "var(--orange-400)",
    marginBottom: 14,
  };
  const rRow: React.CSSProperties = {
    display: "flex",
    justifyContent: "space-between",
    padding: "8px 0",
    borderBottom: "1px solid rgba(255,255,255,0.05)",
  };

  return (
    <div className="bg-main" style={{ minHeight: "100vh" }}>
      <div
        style={{
          maxWidth: 520,
          margin: "0 auto",
          padding: "20px 16px 40px",
          minHeight: "100vh",
          display: "flex",
          flexDirection: "column",
        }}
      >
        {/* Logo */}
        <div style={{ textAlign: "center", marginBottom: 16, paddingTop: 8 }}>
          <a href="/" style={{ textDecoration: "none" }}>
            <img
              src="/logo.png"
              alt="conectr.co"
              style={{ height: 42, objectFit: "contain" }}
            />
          </a>
        </div>

        {/* Progress */}
        {step < 8 && (
          <div style={{ display: "flex", gap: 4, padding: "0 0 16px" }}>
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div
                key={i}
                style={{
                  flex: 1,
                  height: 4,
                  borderRadius: 99,
                  background:
                    i < progressSteps
                      ? "rgba(249,115,22,0.45)"
                      : i === progressSteps
                        ? "var(--orange-500)"
                        : "rgba(255,255,255,0.12)",
                  transition: "all 0.4s",
                }}
              />
            ))}
          </div>
        )}

        {/* ═══ STEP 1 — Basic Info ═══ */}
        {step === 1 && (
          <div
            className="glass-card animate-fade-in-up"
            style={{ padding: "28px" }}
          >
            <div style={{ textAlign: "center", marginBottom: 24 }}>
              <h2
                style={{
                  fontFamily: "var(--font-display)",
                  fontWeight: 700,
                  fontSize: "1.35rem",
                  color: "var(--navy-900)",
                  marginBottom: 6,
                }}
              >
                Tell us about your project
              </h2>
              <p style={{ fontSize: "0.82rem", color: "var(--slate-500)" }}>
                Basic details to get started with your activation
              </p>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
              <div>
                <label className="auth-form-label">
                  Project Name{" "}
                  <span style={{ color: "var(--orange-500)" }}>*</span>
                </label>
                <input
                  className="auth-form-input"
                  placeholder="Enter the project name…"
                  value={form.project_name}
                  onChange={(e) => set("project_name", e.target.value)}
                />
                <ErrorMsg field="project_name" />
              </div>
              <div>
                <label className="auth-form-label">
                  City <span style={{ color: "var(--orange-500)" }}>*</span>
                </label>
                <select
                  className="auth-form-input"
                  value={form.city}
                  onChange={(e) => set("city", e.target.value)}
                >
                  <option value="">Select city</option>
                  {CITIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
                <ErrorMsg field="city" />
              </div>
              <div>
                <label className="auth-form-label">Google Location Link</label>
                <input
                  className="auth-form-input"
                  placeholder="Paste Google Maps link (optional)"
                  value={form.google_location}
                  onChange={(e) => set("google_location", e.target.value)}
                />
              </div>
              <div>
                <label className="auth-form-label">
                  Units Left{" "}
                  <span style={{ color: "var(--orange-500)" }}>*</span>
                </label>
                <select
                  className="auth-form-input"
                  value={form.units_left_label}
                  onChange={(e) => {
                    const opt = UNITS_LEFT_OPTIONS.find(
                      (o) => o.label === e.target.value,
                    );
                    set("units_left_label", e.target.value);
                    if (opt) set("units_left", opt.value);
                  }}
                >
                  <option value="">Select units left</option>
                  {UNITS_LEFT_OPTIONS.map((o) => (
                    <option key={o.label} value={o.label}>
                      {o.label}
                    </option>
                  ))}
                </select>
                <ErrorMsg field="units_left_label" />
              </div>
              <div>
                <label className="auth-form-label">Possession Date</label>
                <input
                  type="date"
                  className="auth-form-input"
                  value={form.possession_date}
                  onChange={(e) => set("possession_date", e.target.value)}
                />
              </div>
              <button
                className="btn btn-gold"
                style={{ width: "100%", marginTop: 4 }}
                onClick={goNext}
              >
                Next →
              </button>
              <p
                style={{
                  fontSize: "0.72rem",
                  color: "var(--slate-500)",
                  textAlign: "center",
                  fontStyle: "italic",
                }}
              >
                Only for developers serious about conectr-led sales
              </p>
            </div>
          </div>
        )}

        {/* ═══ STEP 2 — Project Positioning ═══ */}
        {step === 2 && (
          <div
            className="glass-card animate-fade-in-up"
            style={{ padding: "28px" }}
          >
            <div style={{ textAlign: "center", marginBottom: 24 }}>
              <h2
                style={{
                  fontFamily: "var(--font-display)",
                  fontWeight: 700,
                  fontSize: "1.35rem",
                  color: "var(--navy-900)",
                  marginBottom: 6,
                }}
              >
                Help us understand your project better
              </h2>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
              <div>
                <label className="auth-form-label">
                  Price Range{" "}
                  <span style={{ color: "var(--orange-500)" }}>*</span>
                </label>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {PRICE_RANGES.map((p) => (
                    <Chip
                      key={p}
                      label={p}
                      selected={form.price_range === p}
                      onClick={() => set("price_range", p)}
                    />
                  ))}
                </div>
                <ErrorMsg field="price_range" />
              </div>
              <div>
                <label className="auth-form-label">
                  Location Type{" "}
                  <span style={{ color: "var(--orange-500)" }}>*</span>
                </label>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {LOCATION_TYPES.map((l) => (
                    <Chip
                      key={l}
                      label={l}
                      selected={form.location_type === l}
                      onClick={() => set("location_type", l)}
                    />
                  ))}
                </div>
                <ErrorMsg field="location_type" />
              </div>
              <div>
                <label className="auth-form-label">
                  Unit Structure{" "}
                  <span style={{ color: "var(--orange-500)" }}>*</span>
                </label>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {UNIT_STRUCTURES.map((u) => (
                    <Chip
                      key={u}
                      label={u}
                      selected={form.unit_structure === u}
                      onClick={() => set("unit_structure", u)}
                    />
                  ))}
                </div>
                <ErrorMsg field="unit_structure" />
              </div>
              <div style={{ display: "flex", gap: 10 }}>
                <button
                  className="btn btn-ghost"
                  onClick={goBack}
                  style={{ flex: "0 0 auto", padding: "0.55rem 1.1rem" }}
                >
                  ← Back
                </button>
                <button
                  className="btn btn-gold"
                  onClick={goNext}
                  style={{ flex: 1 }}
                >
                  Next →
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ═══ STEP 3 — Market Dynamics ═══ */}
        {step === 3 && (
          <div
            className="glass-card animate-fade-in-up"
            style={{ padding: "28px" }}
          >
            <div style={{ textAlign: "center", marginBottom: 24 }}>
              <h2
                style={{
                  fontFamily: "var(--font-display)",
                  fontWeight: 700,
                  fontSize: "1.35rem",
                  color: "var(--navy-900)",
                  marginBottom: 6,
                }}
              >
                Current sales and buyer reach
              </h2>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
              <div>
                <label className="auth-form-label">Buyer Type</label>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {BUYER_TYPES.map((b) => (
                    <Chip
                      key={b}
                      label={b}
                      selected={form.buyer_type === b}
                      onClick={() => set("buyer_type", b)}
                    />
                  ))}
                </div>
              </div>
              <div>
                <label className="auth-form-label">
                  Sales Velocity{" "}
                  <span style={{ color: "var(--orange-500)" }}>*</span>
                </label>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {SALES_VELOCITIES.map((s) => (
                    <Chip
                      key={s}
                      label={s}
                      selected={form.sales_velocity === s}
                      onClick={() => set("sales_velocity", s)}
                    />
                  ))}
                </div>
                <ErrorMsg field="sales_velocity" />
              </div>
              <div>
                <label className="auth-form-label">Target Sales Timeline</label>
                <select
                  className="auth-form-input"
                  value={form.target_timeline}
                  onChange={(e) => set("target_timeline", e.target.value)}
                >
                  <option value="">Select months</option>
                  {[1, 2, 3, 6, 9, 12, 18, 24, 36].map((m) => (
                    <option key={m} value={String(m)}>
                      {m} Month{m > 1 ? "s" : ""}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="auth-form-label">Developer Positioning</label>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {DEVELOPER_POSITIONS.map((d) => (
                    <Chip
                      key={d}
                      label={d}
                      selected={form.developer_positioning === d}
                      onClick={() => set("developer_positioning", d)}
                    />
                  ))}
                </div>
              </div>
              <div style={{ display: "flex", gap: 10 }}>
                <button
                  className="btn btn-ghost"
                  onClick={goBack}
                  style={{ flex: "0 0 auto", padding: "0.55rem 1.1rem" }}
                >
                  ← Back
                </button>
                <button
                  className="btn btn-gold"
                  onClick={() => {
                    if (validateStep3()) setStep(4);
                  }}
                  style={{ flex: 1 }}
                >
                  Generate Assessment
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ═══ STEP 4 — Loading ═══ */}
        {step === 4 && (
          <div
            className="glass-card animate-scale-in"
            style={{ padding: "60px 28px", textAlign: "center" }}
          >
            <div
              style={{
                width: 72,
                height: 72,
                borderRadius: "50%",
                border: "4px solid rgba(0,0,0,0.08)",
                borderTopColor: "var(--orange-500)",
                animation: "spin 1s linear infinite",
                margin: "0 auto 28px",
              }}
            />
            <p
              style={{
                fontSize: "0.88rem",
                color: "var(--slate-600)",
                fontWeight: 500,
              }}
              key={loadingMsg}
            >
              {LOADING_MESSAGES[loadingMsg]}
            </p>
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
          </div>
        )}

        {/* ═══ STEP 5 — Assessment Results (dark glass) ═══ */}
        {step === 5 && assessment && (
          <div
            className="glass-card animate-fade-in-up"
            style={{
              padding: "28px",
              backdropFilter: "blur(24px)",
              border: "1px solid rgba(255,255,255,0.12)",
            }}
          >
            <div style={{ textAlign: "center", marginBottom: 20 }}>
              <div
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "4px 14px",
                  borderRadius: 99,
                  background: "rgba(249,115,22,0.15)",
                  border: "1px solid rgba(249,115,22,0.3)",
                  marginBottom: 12,
                }}
              >
                <span style={{ fontSize: 12 }}>🔥</span>
                <span
                  style={{
                    fontSize: "0.72rem",
                    fontWeight: 700,
                    color: "var(--orange-400)",
                  }}
                >
                  ASSESSMENT RESULTS
                </span>
              </div>
              <h2
                style={{
                  fontFamily: "var(--font-display)",
                  fontWeight: 700,
                  fontSize: "1.3rem",
                  color: "var(--navy-900)",
                }}
              >
                Project Distribution Assessment
              </h2>
              <p
                style={{
                  fontSize: "0.78rem",
                  color: "var(--navy-900)",
                  marginTop: 4,
                }}
              >
                Based on your inputs, your CP activation plan is ready
              </p>
            </div>
            {[
              {
                title: "🎯 conectr Activation Scope",
                rows: [
                  ["Recommended Plan", assessment.plan.name],
                  [
                    "Primary CPs (High Intent)",
                    assessment.assessment.primary_activation_layer
                      .cp_count_label,
                  ],
                  [
                    "Secondary CPs (Extended)",
                    assessment.assessment.secondary_distribution_layer
                      .cp_count_label,
                  ],
                  [
                    "Total CP Reach",
                    `${assessment.assessment.primary_activation_layer.cp_count_max + assessment.assessment.secondary_distribution_layer.cp_count_max}+`,
                  ],
                ],
              },
              {
                title: "⚡ Demand Engine Required",
                rows: [
                  [
                    "Matchmaking Sessions",
                    `${assessment.assessment.demand_engine.matchmaking_sessions_needed.toLocaleString()}+`,
                  ],
                  [
                    "Leads Required",
                    `${assessment.assessment.demand_engine.leads_needed.toLocaleString()}+`,
                  ],
                ],
              },
              {
                title: "🚀 Dynamic Boost Layer",
                rows: [
                  [
                    "Boost Cycles",
                    String(assessment.assessment.execution.boost_cycles),
                  ],
                  [
                    "Spike Campaigns",
                    String(assessment.assessment.execution.spike_campaigns),
                  ],
                  ["Estimated Timeline", assessment.plan.validity_label],
                ],
              },
            ].map((section) => (
              <div key={section.title} style={rCard}>
                <p style={rTitle}>{section.title}</p>
                {section.rows.map(([label, val]) => (
                  <div key={label} style={rRow}>
                    <span
                      style={{
                        fontSize: "0.82rem",
                        color: "var(--navy-900)",
                      }}
                    >
                      {label}
                    </span>
                    <span
                      style={{
                        fontSize: "0.88rem",
                        fontWeight: 700,
                        color: "var(--navy-900)",
                      }}
                    >
                      {val}
                    </span>
                  </div>
                ))}
              </div>
            ))}
            <div style={rCard}>
              <p style={rTitle}>🌍 Support Geography</p>
              <p
                style={{
                  fontSize: "0.75rem",
                  color: "var(--navy-900)",
                  marginBottom: 8,
                }}
              >
                CP Supply Cities
              </p>
              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: 6,
                  marginBottom: 12,
                }}
              >
                {assessment.assessment.support_geography.cp_supply_cities.map(
                  (c) => (
                    <span
                      key={c}
                      style={{
                        padding: "4px 12px",
                        borderRadius: 99,
                        background: "rgba(255,255,255,0.08)",
                        border: "1px solid var(--navy-900)",
                        fontSize: "0.75rem",
                        color: "var(--navy-900)",
                      }}
                    >
                      {c}
                    </span>
                  ),
                )}
              </div>
              <p
                style={{
                  fontSize: "0.75rem",
                  color: "var(--navy-900)",
                  marginBottom: 8,
                }}
              >
                Buyer Source Cities
              </p>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {assessment.assessment.support_geography.buyer_source_cities.map(
                  (c) => (
                    <span
                      key={c}
                      style={{
                        padding: "4px 12px",
                        borderRadius: 99,
                        background: "rgba(255,255,255,0.08)",
                        border: "1px solid var(--navy-900)",
                        fontSize: "0.75rem",
                        color: "var(--navy-900)",
                      }}
                    >
                      {c}
                    </span>
                  ),
                )}
              </div>
            </div>
            <button
              className="btn btn-gold"
              style={{ width: "100%" }}
              onClick={() => setStep(6)}
            >
              See Activation Investment →
            </button>
          </div>
        )}

        {/* ═══ STEP 6 — Investment (dark glass) ═══ */}
        {step === 6 && assessment && (
          <div
            className="glass-card animate-fade-in-up"
           
          >
            <div style={{ textAlign: "center", marginBottom: 20 }}>
              <h2
                style={{
                  fontFamily: "var(--font-display)",
                  fontWeight: 700,
                  fontSize: "1.3rem",
                  color: "var(--navy-900)",
                }}
              >
                Activation Investment
              </h2>
              <p
                style={{
                  fontSize: "0.82rem",
                  color: "var(--navy-900)",
                  marginTop: 4,
                }}
              >
                For your inventory of {form.units_left_label} units and target
                buyer reach
              </p>
            </div>
            <div
              style={{
                textAlign: "center",
                padding: "32px 20px",
                background:
                  "linear-gradient(135deg, rgba(249,115,22,0.12), rgba(249,115,22,0.04))",
                border: "1.5px solid rgba(249,115,22,0.25)",
                borderRadius: 20,
                margin: 20,
              }}
            >
              <p
                style={{ fontSize: "0.75rem", color: "var(--navy-900)" }}
              >
                Your activation investment is
              </p>
              <p
                style={{
                  fontFamily: "var(--font-display)",
                  fontWeight: 800,
                  fontSize: "2rem",
                  color: "var(--navy-900)",
                  margin: "8px 0 4px",
                  textShadow: "0 2px 12px rgba(249,115,22,0.3)",
                }}
              >
                {assessment.investment.range_label}
              </p>
              <p
                style={{
                  fontSize: "0.78rem",
                  color: "var(--orange-300)",
                  fontWeight: 600,
                }}
              >
                All Inclusive + Performance Linked
              </p>
            </div>
            <div style={rCard}>
              {[
                `✅ Activates ${assessment.assessment.primary_activation_layer.cp_count_label} Verified CPs`,
                `📍 Hyperlocal Targeting: ${assessment.assessment.support_geography.cp_supply_cities.join(" · ")}`,
                `📊 ${assessment.assessment.demand_engine.matchmaking_sessions_needed}+ Structured Matchmaking Sessions`,
                `⏰ Expected Results in ${Math.ceil(assessment.plan.validity_months * 0.4)}–${Math.ceil(assessment.plan.validity_months * 0.6)} Weeks`,
              ].map((line) => (
                <p
                  key={line}
                  style={{
                    fontSize: "0.8rem",
                    color: "var(--navy-900)",
                    padding: "6px 0",
                  }}
                >
                  {line}
                </p>
              ))}
            </div>
            
            <button
              className="btn btn-gold"
              style={{ width: "100%" }}
              onClick={() => setStep(7)}
            >
              Submit Activation Request →
            </button>
            <div style={{ marginTop: 10 }}>
              <button
                className="btn btn-ghost"
                style={{
                  width: "100%",
                  color: "var(--navy-900)",
                  borderColor: "rgba(255,255,255,0.15)",
                }}
                onClick={() => setStep(5)}
              >
                ← Back to Assessment
              </button>
            </div>
          </div>
        )}

        {/* ═══ STEP 7 — Submit Form (light glass) ═══ */}
        {step === 7 && (
          <div
            className="glass-card animate-fade-in-up"
            style={{ padding: "28px" }}
          >
            <div style={{ textAlign: "center", marginBottom: 20 }}>
              <h2
                style={{
                  fontFamily: "var(--font-display)",
                  fontWeight: 700,
                  fontSize: "1.3rem",
                  color: "var(--navy-900)",
                }}
              >
                Submit Activation
              </h2>
              <p style={{ fontSize: "0.82rem", color: "var(--slate-500)" }}>
                Provide your details to activate your project with
                conectr.co
              </p>
            </div>
            {/* Summary */}
            <div
              style={{
                background: "rgba(30,69,128,0.06)",
                border: "1px solid rgba(30,69,128,0.15)",
                borderRadius: 14,
                padding: 16,
                marginBottom: 20,
              }}
            >
              {[
                { icon: "🏗️", label: "Project", val: form.project_name },
                { icon: "📍", label: "City", val: form.city },
                { icon: "📦", label: "Units Left", val: form.units_left_label },
                {
                  icon: "📋",
                  label: "Recommended Plan",
                  val: assessment?.plan.name,
                },
                {
                  icon: "💰",
                  label: "Activation Investment",
                  val: assessment?.investment.range_label,
                },
              ]
                .filter((r) => r.val)
                .map((r) => (
                  <div
                    key={r.label}
                    style={{ display: "flex", gap: 8, padding: "6px 0" }}
                  >
                    <span style={{ fontSize: "0.88rem" }}>{r.icon}</span>
                    <div>
                      <div
                        style={{
                          fontSize: "0.68rem",
                          color: "var(--slate-500)",
                          fontWeight: 600,
                          textTransform: "uppercase" as const,
                          letterSpacing: "0.04em",
                        }}
                      >
                        {r.label}
                      </div>
                      <div
                        style={{
                          fontSize: "0.85rem",
                          color: "var(--navy-900)",
                          fontWeight: 700,
                        }}
                      >
                        {r.val}
                      </div>
                    </div>
                  </div>
                ))}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <div>
                <label className="auth-form-label">
                  Your Name{" "}
                  <span style={{ color: "var(--orange-500)" }}>*</span>
                </label>
                <input
                  className="auth-form-input"
                  placeholder="Enter your full name"
                  value={form.contact_name}
                  onChange={(e) => set("contact_name", e.target.value)}
                />
                <ErrorMsg field="contact_name" />
              </div>
              <div>
                <label className="auth-form-label">Designation</label>
                <input
                  className="auth-form-input"
                  placeholder="Enter your job title"
                  value={form.designation}
                  onChange={(e) => set("designation", e.target.value)}
                />
              </div>
              <div>
                <label className="auth-form-label">
                  Phone Number{" "}
                  <span style={{ color: "var(--orange-500)" }}>*</span>
                </label>
                <input
                  className="auth-form-input"
                  type="tel"
                  placeholder="Enter your contact number"
                  value={form.phone}
                  onChange={(e) =>
                    set("phone", e.target.value.replace(/\D/g, "").slice(0, 10))
                  }
                />
                <ErrorMsg field="phone" />
              </div>
              <div>
                <label className="auth-form-label">
                  Email ID <span style={{ color: "var(--orange-500)" }}>*</span>
                </label>
                <input
                  className="auth-form-input"
                  type="email"
                  placeholder="Enter your email address"
                  value={form.email}
                  onChange={(e) => set("email", e.target.value)}
                />
                <ErrorMsg field="email" />
              </div>
              <div>
                <label className="auth-form-label">
                  Developer Name{" "}
                  <span style={{ color: "var(--orange-500)" }}>*</span>
                </label>
                <input
                  className="auth-form-input"
                  placeholder="Enter the developer's name"
                  value={form.developer_name}
                  onChange={(e) => set("developer_name", e.target.value)}
                />
                <ErrorMsg field="developer_name" />
              </div>
              <p
                style={{
                  fontSize: "0.72rem",
                  color: "var(--slate-500)",
                  textAlign: "center",
                  fontStyle: "italic",
                }}
              >
                Submission does not guarantee activation. Projects are reviewed
                for network alignment before approval.
              </p>
              {submitError && (
                <p
                  style={{
                    fontSize: "0.78rem",
                    color: "var(--red-600)",
                    textAlign: "center",
                    fontWeight: 600,
                  }}
                >
                  {submitError}
                </p>
              )}
              <button
                className="btn btn-gold"
                style={{ width: "100%" }}
                onClick={goNext}
                disabled={submitting}
              >
                {submitting ? "Submitting…" : "Submit For conectr Approval →"}
              </button>
              <button
                className="btn btn-ghost"
                style={{ width: "100%" }}
                onClick={() => setStep(6)}
              >
                ← Back
              </button>
            </div>
          </div>
        )}

        {/* ═══ STEP 8 — Success ═══ */}
        {step === 8 && (
          <div
            className="glass-card animate-scale-in"
            style={{ padding: "40px 28px", textAlign: "center" }}
          >
            <div
              style={{
                width: 72,
                height: 72,
                borderRadius: "50%",
                background: "linear-gradient(135deg, #16a34a, #15803d)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                margin: "0 auto 20px",
                boxShadow: "0 4px 20px rgba(22,163,74,0.35)",
              }}
            >
              <svg
                width="32"
                height="32"
                fill="none"
                viewBox="0 0 24 24"
                stroke="#fff"
                strokeWidth={2.5}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M5 13l4 4L19 7"
                />
              </svg>
            </div>
            <h2
              style={{
                fontFamily: "var(--font-display)",
                fontSize: "1.4rem",
                fontWeight: 700,
                color: "var(--navy-900)",
                marginBottom: 8,
              }}
            >
              Activation Request Submitted
            </h2>
            <p
              style={{
                fontSize: "0.88rem",
                color: "var(--slate-600)",
                lineHeight: 1.6,
                marginBottom: 28,
              }}
            >
              You will be contacted via email and phone call within 48 hours.
              Here's what we will be doing:
            </p>
            <div
              style={{
                textAlign: "left",
                display: "flex",
                flexDirection: "column",
                gap: 14,
                marginBottom: 32,
              }}
            >
              {[
                { icon: "🔍", text: "Detailed review of your project" },
                { icon: "📋", text: "Tailoring your activation plan" },
                { icon: "🤝", text: "Aligning CPs for targeted matchmaking" },
              ].map((item) => (
                <div
                  key={item.text}
                  style={{ display: "flex", alignItems: "center", gap: 12 }}
                >
                  <div
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: 10,
                      background: "var(--navy-50)",
                      border: "1px solid var(--navy-100)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      flexShrink: 0,
                    }}
                  >
                    {item.icon}
                  </div>
                  <span
                    style={{
                      fontSize: "0.85rem",
                      color: "var(--slate-700)",
                      fontWeight: 500,
                    }}
                  >
                    {item.text}
                  </span>
                </div>
              ))}
            </div>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
                padding: "10px 16px",
                borderRadius: 12,
                background: "var(--green-100)",
                border: "1px solid rgba(22,163,74,0.25)",
                marginBottom: 24,
                fontSize: "0.8rem",
                color: "var(--green-600)",
                fontWeight: 600,
              }}
            >
              Expect an update within 48 hours
            </div>
            <a href="/" style={{ textDecoration: "none" }}>
              <button className="btn btn-primary" style={{ width: "100%" }}>
                Back to projects
              </button>
            </a>
          </div>
        )}
      </div>
    </div>
  );
}
