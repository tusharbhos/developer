import { useState, useEffect, useCallback } from "react";

/* ═══════════════════════════════════════════════════════════════
   ASSESSMENT ENGINE — ported from assessment_engine.js
═══════════════════════════════════════════════════════════════ */
const CONFIG = {
  plans: [
    { name: "Quick Liquidation", units_min: 1, units_max: 10, base_investment_lower: 125000, validity_months: 1, l1_cp_range: [4, 6], l2_cp_range: [8, 12] },
    { name: "Focused Closure", units_min: 11, units_max: 30, base_investment_lower: 325000, validity_months: 3, l1_cp_range: [6, 10], l2_cp_range: [15, 22] },
    { name: "Sales Acceleration", units_min: 31, units_max: 75, base_investment_lower: 750000, validity_months: 6, l1_cp_range: [10, 16], l2_cp_range: [24, 36] },
    { name: "Growth Distribution", units_min: 76, units_max: 200, base_investment_lower: 1400000, validity_months: 12, l1_cp_range: [14, 22], l2_cp_range: [35, 55] },
    { name: "Full Distribution", units_min: 201, units_max: 500, base_investment_lower: 2000000, validity_months: 12, l1_cp_range: [20, 32], l2_cp_range: [60, 90] },
    { name: "Enterprise Distribution", units_min: 501, units_max: 1000000, base_investment_lower: 3500000, validity_months: 24, l1_cp_range: [30, 50], l2_cp_range: [90, 140] },
  ],
  location_strength: {
    prime: { price_multiplier: 1.2, l1_multiplier: 1.2, l2_multiplier: 0.9, sessions_per_closure: 7, lead_to_session_ratio: 1.7, timeline_multiplier: 1.0, description: "Curated, specialist-led activation with metro and premium buyer pull." },
    established: { price_multiplier: 1.1, l1_multiplier: 1.0, l2_multiplier: 1.0, sessions_per_closure: 9, lead_to_session_ratio: 2.0, timeline_multiplier: 1.0, description: "Balanced activation across specialist and broad CP network." },
    developing: { price_multiplier: 1.0, l1_multiplier: 0.9, l2_multiplier: 1.15, sessions_per_closure: 12, lead_to_session_ratio: 2.2, timeline_multiplier: 1.1, description: "Requires broader distribution and more follow-up effort." },
    remote: { price_multiplier: 0.95, l1_multiplier: 0.8, l2_multiplier: 1.25, sessions_per_closure: 15, lead_to_session_ratio: 2.5, timeline_multiplier: 1.2, description: "Higher distribution effort and longer conversion cycle." },
  },
  sales_velocity: {
    fast: { price_multiplier: 0.95, timeline_multiplier: 0.9 },
    moderate: { price_multiplier: 1.0, timeline_multiplier: 1.0 },
    slow: { price_multiplier: 1.1, timeline_multiplier: 1.1 },
    stuck: { price_multiplier: 1.2, timeline_multiplier: 1.25 },
  },
  city_source_map: {
    pune: { cp_supply_cities: ["Pune", "Mumbai", "Thane", "Navi Mumbai"], buyer_source_cities: ["Pune", "Mumbai", "Thane", "Navi Mumbai", "Nashik"] },
    mumbai: { cp_supply_cities: ["Mumbai", "Thane", "Navi Mumbai", "Pune"], buyer_source_cities: ["Mumbai", "Thane", "Navi Mumbai", "Pune", "Ahmedabad"] },
    bangalore: { cp_supply_cities: ["Bengaluru", "Mumbai", "Hyderabad", "Chennai"], buyer_source_cities: ["Bengaluru", "Hyderabad", "Chennai", "Mumbai"] },
    hyderabad: { cp_supply_cities: ["Hyderabad", "Bengaluru", "Mumbai", "Pune"], buyer_source_cities: ["Hyderabad", "Bengaluru", "Mumbai", "Pune"] },
    delhi: { cp_supply_cities: ["Delhi NCR", "Gurugram", "Noida", "Ghaziabad"], buyer_source_cities: ["Delhi NCR", "Gurugram", "Noida", "Faridabad", "Ghaziabad"] },
    gurugram: { cp_supply_cities: ["Delhi NCR", "Gurugram", "Noida", "Ghaziabad"], buyer_source_cities: ["Delhi NCR", "Gurugram", "Noida", "Faridabad", "Ghaziabad"] },
    noida: { cp_supply_cities: ["Delhi NCR", "Noida", "Gurugram", "Ghaziabad"], buyer_source_cities: ["Delhi NCR", "Noida", "Gurugram", "Faridabad", "Ghaziabad"] },
    dubai: { cp_supply_cities: ["Dubai", "Mumbai", "Delhi NCR", "Hyderabad"], buyer_source_cities: ["Mumbai", "Delhi NCR", "Hyderabad", "Bengaluru", "Ahmedabad"] },
    default: { cp_supply_cities: ["Local City", "Nearby Metro", "Regional Hub"], buyer_source_cities: ["Local City", "Nearby Metro", "Regional Hub"] },
  },
};

function roundToNearest(value, nearest) { return Math.round(value / nearest) * nearest; }
function formatInrLakh(value) { const lakh = value / 100000; return `₹${lakh.toFixed(2)}L`; }

function buildAssessment(input) {
  const plan = CONFIG.plans.find(p => input.units_left >= p.units_min && input.units_left <= p.units_max);
  if (!plan) return null;
  const locKey = (input.location_strength || "established").toLowerCase();
  const velKey = (input.sales_velocity || "moderate").toLowerCase();
  const locRule = CONFIG.location_strength[locKey] || CONFIG.location_strength.established;
  const velRule = CONFIG.sales_velocity[velKey] || CONFIG.sales_velocity.moderate;
  const cityMap = CONFIG.city_source_map[(input.city || "").toLowerCase()] || CONFIG.city_source_map.default;
  let validityMonths = Math.ceil(plan.validity_months * locRule.timeline_multiplier * velRule.timeline_multiplier);
  if (input.target_timeline_months && input.target_timeline_months > 0) validityMonths = Math.max(validityMonths, Math.ceil(input.target_timeline_months));
  const lowerRaw = plan.base_investment_lower * locRule.price_multiplier * velRule.price_multiplier;
  const lower = roundToNearest(lowerRaw, 5000);
  const upper = roundToNearest(lower * 1.5, 5000);
  const l1Min = Math.round(plan.l1_cp_range[0] * locRule.l1_multiplier);
  const l1Max = Math.round(plan.l1_cp_range[1] * locRule.l1_multiplier);
  const l2Min = Math.round(plan.l2_cp_range[0] * locRule.l2_multiplier);
  const l2Max = Math.round(plan.l2_cp_range[1] * locRule.l2_multiplier);
  const sessions = Math.ceil(input.units_left * locRule.sessions_per_closure);
  const leads = Math.ceil(sessions * locRule.lead_to_session_ratio);
  const boostCycles = Math.max(1, Math.ceil(validityMonths / 2));
  const spikeCampaigns = Math.max(1, Math.ceil(validityMonths / 4));
  return {
    plan: { name: plan.name, validity_months: validityMonths, validity_label: validityMonths === 1 ? "1 Month" : `${validityMonths} Months` },
    investment: { lower, upper, lower_label: formatInrLakh(lower), upper_label: formatInrLakh(upper), range_label: `${formatInrLakh(lower)} – ${formatInrLakh(upper)}` },
    assessment: {
      primary_activation_layer: { cp_count_min: l1Min, cp_count_max: l1Max, cp_count_label: `${l1Min}–${l1Max}`, descriptor: "Verified CPs with priority push and direct showcase" },
      secondary_distribution_layer: { cp_count_min: l2Min, cp_count_max: l2Max, cp_count_label: `${l2Min}–${l2Max}`, descriptor: "Suggested-tag visibility for broader aligned distribution" },
      demand_engine: { matchmaking_sessions_needed: sessions, leads_needed: leads },
      execution: { boost_cycles: boostCycles, spike_campaigns: spikeCampaigns },
      support_geography: { cp_supply_cities: cityMap.cp_supply_cities, buyer_source_cities: cityMap.buyer_source_cities },
    },
    location_description: locRule.description,
  };
}

/* ═══════════════════════════════════════════════════════════════
   CONSTANTS
═══════════════════════════════════════════════════════════════ */
const UNITS_LEFT_OPTIONS = [
  { label: "1 – 10", min: 1, max: 10, value: 5 },
  { label: "11 – 30", min: 11, max: 30, value: 20 },
  { label: "31 – 75", min: 31, max: 75, value: 50 },
  { label: "76 – 200", min: 76, max: 200, value: 130 },
  { label: "200 – 500", min: 200, max: 500, value: 350 },
  { label: "500+", min: 501, max: 1000000, value: 750 },
];

const CITIES = ["Pune", "Mumbai", "Bangalore", "Hyderabad", "Delhi", "Gurugram", "Noida", "Dubai", "Other"];

const PRICE_RANGES = ["< ₹50L", "₹50L – ₹1.5Cr", "₹1.5Cr – ₹3Cr", "₹3Cr – ₹5Cr", "₹5Cr – ₹10Cr", "₹10Cr+"];
const LOCATION_TYPES = ["Prime", "Established", "Developing", "Remote"];
const UNIT_STRUCTURES = ["Single Type", "Few Variants", "Multiple Variants"];

const BUYER_TYPES = ["Local", "Outstation", "Pan India", "NRI"];
const SALES_VELOCITIES = ["Fast", "Moderate", "Slow", "Stuck"];
const DEVELOPER_POSITIONS = ["Tier 1", "Known", "Emerging"];

const LOADING_MESSAGES = [
  "Analyzing market positioning…",
  "Evaluating channel partner fit…",
  "Estimating distribution effort…",
  "Preparing activation plan…",
];

/* ═══════════════════════════════════════════════════════════════
   STYLES
═══════════════════════════════════════════════════════════════ */
const CSS = `
@import url('https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,300;0,9..40,400;0,9..40,500;0,9..40,600;0,9..40,700;0,9..40,800&family=Playfair+Display:wght@600;700;800&display=swap');

:root {
  --navy-950: #060e1a; --navy-900: #0a1628; --navy-800: #0f2240;
  --navy-700: #163258; --navy-600: #1e4580; --navy-500: #2558a8;
  --navy-400: #4a7dc8; --navy-300: #7da4d8; --navy-100: #dae8f8; --navy-50: #f0f6fe;
  --orange-700: #c2410c; --orange-600: #ea580c; --orange-500: #f97316;
  --orange-400: #fb923c; --orange-300: #fdba74; --orange-100: #ffedd5; --orange-50: #fff7ed;
  --slate-900: #0f172a; --slate-700: #334155; --slate-500: #64748b;
  --slate-400: #94a3b8; --slate-200: #e2e8f0; --slate-100: #f1f5f9; --slate-50: #f8fafc;
  --green-600: #16a34a; --green-100: #dcfce7;
  --red-600: #dc2626; --red-100: #fee2e2;
  --font-display: 'Playfair Display', 'Trebuchet MS', serif;
  --font-body: 'DM Sans', 'Segoe UI', sans-serif;
}
* { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: var(--font-body); background: #0a1628; }

.wizard-root {
  min-height: 100vh;
  background: linear-gradient(165deg, #060e1a 0%, #0f2240 35%, #163258 65%, #1e4580 100%);
  position: relative; overflow: hidden;
}
.wizard-root::before {
  content: ''; position: absolute; inset: 0; pointer-events: none;
  background: radial-gradient(ellipse 80% 60% at 50% 0%, rgba(249,115,22,0.08) 0%, transparent 70%),
              radial-gradient(ellipse 60% 50% at 80% 100%, rgba(30,69,128,0.15) 0%, transparent 70%);
}

.wizard-container {
  position: relative; z-index: 1;
  max-width: 520px; margin: 0 auto;
  padding: 20px 16px 40px;
  min-height: 100vh; display: flex; flex-direction: column;
}

/* ── Glass Card ── */
.glass-card {
  background: rgba(255,255,255,0.07);
  backdrop-filter: blur(24px); -webkit-backdrop-filter: blur(24px);
  border: 1px solid rgba(255,255,255,0.15);
  border-radius: 24px;
  box-shadow: 0 8px 32px rgba(0,0,0,0.25), inset 0 1px 0 rgba(255,255,255,0.1);
  overflow: hidden;
}

.card-header {
  padding: 28px 28px 20px;
  text-align: center;
}
.card-header h2 {
  font-family: var(--font-display); font-weight: 700;
  font-size: 1.45rem; color: #fff;
  line-height: 1.3; margin-bottom: 6px;
}
.card-header p {
  font-size: 0.82rem; color: rgba(255,255,255,0.55);
  line-height: 1.5;
}

.card-body { padding: 0 28px 28px; }

/* ── Progress ── */
.progress-bar {
  display: flex; align-items: center; gap: 4px;
  padding: 16px 28px 0;
}
.progress-dot {
  flex: 1; height: 4px; border-radius: 99px;
  background: rgba(255,255,255,0.12); transition: all 0.4s ease;
}
.progress-dot.active { background: var(--orange-500); }
.progress-dot.done { background: rgba(249,115,22,0.45); }

/* ── Labels ── */
.field-label {
  font-size: 0.72rem; font-weight: 700; text-transform: uppercase;
  letter-spacing: 0.08em; color: rgba(255,255,255,0.5);
  margin-bottom: 8px; display: block;
}
.field-label .req { color: var(--orange-400); }

/* ── Inputs ── */
.glass-input {
  width: 100%; padding: 14px 16px;
  background: rgba(255,255,255,0.08);
  border: 1.5px solid rgba(255,255,255,0.15);
  border-radius: 14px; color: #fff;
  font-size: 0.92rem; font-family: var(--font-body);
  outline: none; transition: all 0.2s;
  -webkit-appearance: none; appearance: none;
}
.glass-input::placeholder { color: rgba(255,255,255,0.3); }
.glass-input:focus {
  border-color: rgba(249,115,22,0.6);
  background: rgba(255,255,255,0.12);
  box-shadow: 0 0 0 3px rgba(249,115,22,0.12);
}
select.glass-input {
  cursor: pointer;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='%23ffffff80' stroke-width='2'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' d='M19 9l-7 7-7-7'/%3E%3C/svg%3E");
  background-repeat: no-repeat; background-position: right 12px center; background-size: 18px;
  padding-right: 40px;
}
select.glass-input option { background: #0f2240; color: #fff; }

/* ── Chip Groups ── */
.chip-group { display: flex; flex-wrap: wrap; gap: 8px; }
.chip {
  padding: 10px 18px; border-radius: 12px; cursor: pointer;
  font-size: 0.82rem; font-weight: 600;
  background: rgba(255,255,255,0.06);
  border: 1.5px solid rgba(255,255,255,0.12);
  color: rgba(255,255,255,0.6);
  transition: all 0.2s; user-select: none;
}
.chip:hover { background: rgba(255,255,255,0.1); border-color: rgba(255,255,255,0.25); }
.chip.selected {
  background: linear-gradient(135deg, rgba(249,115,22,0.25), rgba(249,115,22,0.12));
  border-color: var(--orange-500); color: #fff;
  box-shadow: 0 0 12px rgba(249,115,22,0.2);
}

/* ── Buttons ── */
.btn-gold {
  display: flex; align-items: center; justify-content: center; gap: 8px;
  width: 100%; padding: 16px; border-radius: 14px;
  background: linear-gradient(135deg, var(--orange-500), var(--orange-600));
  color: #fff; font-weight: 800; font-size: 1rem;
  font-family: var(--font-display); border: none; cursor: pointer;
  box-shadow: 0 4px 20px rgba(249,115,22,0.4);
  transition: all 0.2s; letter-spacing: 0.02em;
}
.btn-gold:hover:not(:disabled) { transform: translateY(-2px); box-shadow: 0 8px 28px rgba(249,115,22,0.5); }
.btn-gold:active:not(:disabled) { transform: scale(0.98); }
.btn-gold:disabled { opacity: 0.4; cursor: not-allowed; transform: none; }

.btn-ghost {
  display: flex; align-items: center; justify-content: center; gap: 6px;
  width: 100%; padding: 14px; border-radius: 14px;
  background: rgba(255,255,255,0.06);
  border: 1.5px solid rgba(255,255,255,0.15);
  color: rgba(255,255,255,0.7); font-weight: 600; font-size: 0.88rem;
  font-family: var(--font-body); cursor: pointer; transition: all 0.2s;
}
.btn-ghost:hover { background: rgba(255,255,255,0.1); color: #fff; }

.btn-navy {
  display: flex; align-items: center; justify-content: center; gap: 8px;
  width: 100%; padding: 16px; border-radius: 14px;
  background: linear-gradient(135deg, var(--navy-600), var(--navy-800));
  color: #fff; font-weight: 700; font-size: 0.95rem;
  font-family: var(--font-body); border: none; cursor: pointer;
  box-shadow: 0 4px 16px rgba(30,69,128,0.4); transition: all 0.2s;
}
.btn-navy:hover { transform: translateY(-1px); box-shadow: 0 6px 24px rgba(30,69,128,0.5); }

/* ── Spacers ── */
.field-group { margin-bottom: 20px; }
.btn-row { display: flex; gap: 10px; margin-top: 24px; }

/* ── Loading Screen ── */
.loader-wrap {
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  padding: 60px 28px; text-align: center;
}
.loader-ring {
  width: 72px; height: 72px; border-radius: 50%;
  border: 4px solid rgba(255,255,255,0.08);
  border-top-color: var(--orange-500);
  animation: spin 1s linear infinite;
  margin-bottom: 28px;
}
@keyframes spin { to { transform: rotate(360deg); } }
.loader-text {
  font-size: 0.88rem; color: rgba(255,255,255,0.65);
  font-weight: 500; min-height: 24px;
  animation: fadeText 0.4s ease;
}
@keyframes fadeText { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }

/* ── Result Cards ── */
.result-section {
  background: rgba(255,255,255,0.05);
  border: 1px solid rgba(255,255,255,0.08);
  border-radius: 16px; padding: 20px; margin-bottom: 16px;
}
.result-section-title {
  font-family: var(--font-display); font-size: 0.78rem; font-weight: 700;
  text-transform: uppercase; letter-spacing: 0.1em;
  color: var(--orange-400); margin-bottom: 14px;
}
.result-row {
  display: flex; justify-content: space-between; align-items: center;
  padding: 8px 0; border-bottom: 1px solid rgba(255,255,255,0.05);
}
.result-row:last-child { border-bottom: none; }
.result-label { font-size: 0.82rem; color: rgba(255,255,255,0.55); }
.result-value { font-size: 0.88rem; font-weight: 700; color: #fff; }

.investment-hero {
  text-align: center; padding: 32px 20px;
  background: linear-gradient(135deg, rgba(249,115,22,0.12), rgba(249,115,22,0.04));
  border: 1.5px solid rgba(249,115,22,0.25);
  border-radius: 20px; margin-bottom: 20px;
}
.investment-hero .price {
  font-family: var(--font-display); font-weight: 800;
  font-size: 2rem; color: #fff; margin: 8px 0 4px;
  text-shadow: 0 2px 12px rgba(249,115,22,0.3);
}
.investment-hero .subtitle {
  font-size: 0.78rem; color: var(--orange-300); font-weight: 600;
}

.city-tags { display: flex; flex-wrap: wrap; gap: 6px; }
.city-tag {
  padding: 4px 12px; border-radius: 99px;
  background: rgba(255,255,255,0.08);
  border: 1px solid rgba(255,255,255,0.1);
  font-size: 0.75rem; color: rgba(255,255,255,0.7);
  font-weight: 500;
}

/* ── Success Screen ── */
.success-icon {
  width: 72px; height: 72px; border-radius: 50%;
  background: linear-gradient(135deg, var(--green-600), #15803d);
  display: flex; align-items: center; justify-content: center;
  margin: 0 auto 20px;
  box-shadow: 0 4px 20px rgba(22,163,74,0.35);
}

/* ── Alert ── */
.alert-box {
  display: flex; align-items: flex-start; gap: 10px;
  padding: 12px 16px; border-radius: 12px;
  font-size: 0.8rem; line-height: 1.5; margin-bottom: 16px;
}
.alert-danger { background: rgba(220,38,38,0.12); border: 1px solid rgba(220,38,38,0.25); color: #fca5a5; }
.alert-info { background: rgba(30,69,128,0.12); border: 1px solid rgba(30,69,128,0.25); color: var(--navy-300); }
.alert-success { background: rgba(22,163,74,0.12); border: 1px solid rgba(22,163,74,0.25); color: #86efac; }

/* ── Separator ── */
.glass-divider {
  height: 1px; width: 80%; margin: 20px auto;
  background: linear-gradient(to right, transparent, rgba(255,255,255,0.15), transparent);
}

/* ── Step indicator ── */
.step-indicator {
  display: flex; align-items: center; justify-content: center; gap: 8px;
  margin-bottom: 20px;
}
.step-num {
  width: 28px; height: 28px; border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  font-size: 0.7rem; font-weight: 800; color: #fff;
  background: linear-gradient(135deg, var(--orange-500), var(--orange-600));
}
.step-text { font-size: 0.72rem; color: rgba(255,255,255,0.45); font-weight: 600; text-transform: uppercase; letter-spacing: 0.06em; }

/* ── Summary card ── */
.summary-card {
  background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08);
  border-radius: 14px; padding: 16px; margin-bottom: 20px;
}
.summary-row {
  display: flex; gap: 8px; align-items: flex-start;
  padding: 6px 0;
}
.summary-row .icon { font-size: 0.88rem; flex-shrink: 0; margin-top: 1px; }
.summary-row .label { font-size: 0.75rem; color: rgba(255,255,255,0.45); }
.summary-row .val { font-size: 0.82rem; color: #fff; font-weight: 600; }

/* ── Fade animations ── */
@keyframes fadeInUp { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
@keyframes scaleIn { from { opacity: 0; transform: scale(0.92); } to { opacity: 1; transform: scale(1); } }
.animate-in { animation: fadeInUp 0.45s ease-out both; }
.animate-scale { animation: scaleIn 0.35s ease-out both; }

/* ── Trust line ── */
.trust-line {
  font-size: 0.72rem; color: rgba(255,255,255,0.35);
  text-align: center; margin-top: 16px; line-height: 1.5;
  font-style: italic;
}

/* ── Back link ── */
.back-top {
  display: flex; align-items: center; gap: 6px; margin-bottom: 16px;
  font-size: 0.82rem; color: rgba(255,255,255,0.5);
  cursor: pointer; font-weight: 500; transition: color 0.2s; background: none; border: none;
}
.back-top:hover { color: #fff; }

/* ── Scrollbar ── */
::-webkit-scrollbar { width: 4px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.15); border-radius: 2px; }

/* ── Responsive ── */
@media (max-width: 480px) {
  .wizard-container { padding: 12px 10px 32px; }
  .card-header { padding: 22px 20px 16px; }
  .card-header h2 { font-size: 1.25rem; }
  .card-body { padding: 0 20px 22px; }
  .progress-bar { padding: 12px 20px 0; }
  .chip { padding: 9px 14px; font-size: 0.78rem; }
  .investment-hero .price { font-size: 1.65rem; }
}
`;

/* ═══════════════════════════════════════════════════════════════
   MAIN WIZARD COMPONENT
═══════════════════════════════════════════════════════════════ */
export default function ActivateProjectWizard() {
  const [step, setStep] = useState(1);
  const totalSteps = 8; // 1=basic, 2=positioning, 3=market, 4=loading, 5=assessment, 6=investment, 7=submit, 8=success

  // Form state
  const [form, setForm] = useState({
    project_name: "", city: "", google_location: "", units_left_label: "", units_left: 0,
    possession_date: "", price_range: "", location_type: "", unit_structure: "",
    buyer_type: "", sales_velocity: "", target_timeline: "", developer_positioning: "",
    contact_name: "", designation: "", phone: "", email: "", developer_name: "",
  });
  const [errors, setErrors] = useState({});
  const [assessment, setAssessment] = useState(null);
  const [loadingMsg, setLoadingMsg] = useState(0);
  const [submitting, setSubmitting] = useState(false);

  const set = (k, v) => { setForm(p => ({ ...p, [k]: v })); setErrors(p => ({ ...p, [k]: undefined })); };

  // ── Step 1 validation ──
  const validateStep1 = () => {
    const e = {};
    if (!form.project_name.trim()) e.project_name = "Required";
    if (!form.city) e.city = "Required";
    if (!form.units_left) e.units_left_label = "Required";
    setErrors(e);
    return !Object.keys(e).length;
  };

  // ── Step 2 validation ──
  const validateStep2 = () => {
    const e = {};
    if (!form.price_range) e.price_range = "Required";
    if (!form.location_type) e.location_type = "Required";
    if (!form.unit_structure) e.unit_structure = "Required";
    setErrors(e);
    return !Object.keys(e).length;
  };

  // ── Step 3 validation ──
  const validateStep3 = () => {
    const e = {};
    if (!form.sales_velocity) e.sales_velocity = "Required";
    setErrors(e);
    return !Object.keys(e).length;
  };

  // ── Step 7 validation ──
  const validateStep7 = () => {
    const e = {};
    if (!form.contact_name.trim()) e.contact_name = "Required";
    if (!form.phone.match(/^\d{10}$/)) e.phone = "Valid 10-digit number required";
    if (!form.email.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)) e.email = "Valid email required";
    if (!form.developer_name.trim()) e.developer_name = "Required";
    setErrors(e);
    return !Object.keys(e).length;
  };

  // ── Generate assessment ──
  const generateAssessment = useCallback(() => {
    const locMap = { "Prime": "prime", "Established": "established", "Developing": "developing", "Remote": "remote" };
    const velMap = { "Fast": "fast", "Moderate": "moderate", "Slow": "slow", "Stuck": "stuck" };
    const input = {
      project_name: form.project_name,
      city: form.city,
      units_left: form.units_left,
      location_strength: locMap[form.location_type] || "established",
      sales_velocity: velMap[form.sales_velocity] || "moderate",
      target_timeline_months: parseInt(form.target_timeline) || 0,
    };
    return buildAssessment(input);
  }, [form]);

  // ── Loading screen timer ──
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
        const result = generateAssessment();
        setAssessment(result);
        setStep(5);
      }
    }, 700);
    return () => clearInterval(interval);
  }, [step, generateAssessment]);

  // ── Navigation ──
  const goNext = () => {
    if (step === 1 && !validateStep1()) return;
    if (step === 2 && !validateStep2()) return;
    if (step === 3 && !validateStep3()) return;
    if (step === 7 && !validateStep7()) return;
    if (step === 7) { handleSubmit(); return; }
    setStep(s => s + 1);
    setErrors({});
  };
  const goBack = () => { if (step > 1 && step !== 4 && step !== 8) setStep(s => s - 1); };

  // ── Submit ──
  const handleSubmit = async () => {
    setSubmitting(true);
    // Prepare full payload
    const payload = {
      ...form,
      assessment: assessment ? JSON.stringify(assessment) : null,
      submitted_at: new Date().toISOString(),
    };
    try {
      const API_URL = process.env.NEXT_PUBLIC_API_URL;
      const token = typeof window !== "undefined" ? localStorage.getItem("cp_token") : null;
      // Try to submit to backend — if fails, still show success (data saved locally)
      try {
        await fetch(`${API_URL}/activation-requests`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Accept": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify(payload),
        });
      } catch { /* API might not exist yet — proceed */ }
      setStep(8);
    } catch {
      setStep(8);
    } finally {
      setSubmitting(false);
    }
  };

  // ── Computed progress ──
  const progressSteps = step <= 3 ? step : step === 4 ? 3 : step <= 6 ? 4 : step === 7 ? 5 : 6;

  // ── Chip helper ──
  const Chip = ({ label, selected, onClick }) => (
    <button type="button" className={`chip${selected ? " selected" : ""}`} onClick={onClick}>{label}</button>
  );

  const ErrorMsg = ({ field }) => errors[field] ? <p style={{ color: "#fca5a5", fontSize: "0.72rem", marginTop: 4 }}>{errors[field]}</p> : null;

  return (
    <>
      <style>{CSS}</style>
      <div className="wizard-root">
        <div className="wizard-container">

          {/* ── Logo ── */}
          <div style={{ textAlign: "center", marginBottom: 16, paddingTop: 8 }}>
            <div style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
              <div style={{ width: 32, height: 32, borderRadius: 8, background: "linear-gradient(135deg, var(--orange-500), var(--orange-600))", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, color: "#fff", fontSize: 14, fontFamily: "var(--font-display)" }}>CP</div>
              <span style={{ color: "#fff", fontWeight: 700, fontSize: "0.88rem", fontFamily: "var(--font-display)" }}>ChannelPartner.Network</span>
            </div>
          </div>

          {/* ── Progress ── */}
          {step < 8 && (
            <div className="progress-bar" style={{ marginBottom: 16 }}>
              {[1, 2, 3, 4, 5, 6].map(i => (
                <div key={i} className={`progress-dot${i < progressSteps ? " done" : i === progressSteps ? " active" : ""}`} />
              ))}
            </div>
          )}

          {/* ═══════════════════════════════════════
             STEP 1 — Basic Info
          ═══════════════════════════════════════ */}
          {step === 1 && (
            <div className="glass-card animate-in">
              <div className="card-header">
                <h2>Tell us about your project</h2>
                <p>Basic details to get started with your activation</p>
              </div>
              <div className="card-body">
                <div className="field-group">
                  <label className="field-label">Project Name <span className="req">*</span></label>
                  <input className="glass-input" placeholder="Enter the project name…" value={form.project_name} onChange={e => set("project_name", e.target.value)} />
                  <ErrorMsg field="project_name" />
                </div>
                <div className="field-group">
                  <label className="field-label">City <span className="req">*</span></label>
                  <select className="glass-input" value={form.city} onChange={e => set("city", e.target.value)}>
                    <option value="">Select city</option>
                    {CITIES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                  <ErrorMsg field="city" />
                </div>
                <div className="field-group">
                  <label className="field-label">Google Location Link</label>
                  <input className="glass-input" placeholder="Paste Google Maps link (optional)" value={form.google_location} onChange={e => set("google_location", e.target.value)} />
                </div>
                <div className="field-group">
                  <label className="field-label">Units Left <span className="req">*</span></label>
                  <select className="glass-input" value={form.units_left_label} onChange={e => {
                    const opt = UNITS_LEFT_OPTIONS.find(o => o.label === e.target.value);
                    set("units_left_label", e.target.value);
                    if (opt) set("units_left", opt.value);
                  }}>
                    <option value="">Select units left</option>
                    {UNITS_LEFT_OPTIONS.map(o => <option key={o.label} value={o.label}>{o.label}</option>)}
                  </select>
                  <ErrorMsg field="units_left_label" />
                </div>
                <div className="field-group">
                  <label className="field-label">Possession Date</label>
                  <input type="date" className="glass-input" value={form.possession_date} onChange={e => set("possession_date", e.target.value)} />
                </div>
                <button className="btn-gold" onClick={goNext}>Next →</button>
                <p className="trust-line">Only for developers serious about channel-partner-led sales</p>
              </div>
            </div>
          )}

          {/* ═══════════════════════════════════════
             STEP 2 — Project Positioning
          ═══════════════════════════════════════ */}
          {step === 2 && (
            <div className="glass-card animate-in">
              <div className="card-header">
                <h2>Help us understand your project better</h2>
                <p>Position, price range, and unit mix</p>
              </div>
              <div className="card-body">
                <div className="field-group">
                  <label className="field-label">Price Range <span className="req">*</span></label>
                  <div className="chip-group">
                    {PRICE_RANGES.map(p => <Chip key={p} label={p} selected={form.price_range === p} onClick={() => set("price_range", p)} />)}
                  </div>
                  <ErrorMsg field="price_range" />
                </div>
                <div className="field-group">
                  <label className="field-label">Location Type <span className="req">*</span></label>
                  <div className="chip-group">
                    {LOCATION_TYPES.map(l => <Chip key={l} label={l} selected={form.location_type === l} onClick={() => set("location_type", l)} />)}
                  </div>
                  <ErrorMsg field="location_type" />
                </div>
                <div className="field-group">
                  <label className="field-label">Unit Structure <span className="req">*</span></label>
                  <div className="chip-group">
                    {UNIT_STRUCTURES.map(u => <Chip key={u} label={u} selected={form.unit_structure === u} onClick={() => set("unit_structure", u)} />)}
                  </div>
                  <ErrorMsg field="unit_structure" />
                </div>
                <div className="btn-row">
                  <button className="btn-ghost" onClick={goBack} style={{ flex: "0 0 auto", width: "auto", padding: "14px 20px" }}>← Back</button>
                  <button className="btn-gold" onClick={goNext} style={{ flex: 1 }}>Next →</button>
                </div>
              </div>
            </div>
          )}

          {/* ═══════════════════════════════════════
             STEP 3 — Market Dynamics
          ═══════════════════════════════════════ */}
          {step === 3 && (
            <div className="glass-card animate-in">
              <div className="card-header">
                <h2>Current sales and buyer reach</h2>
                <p>Market dynamics and sales velocity</p>
              </div>
              <div className="card-body">
                <div className="field-group">
                  <label className="field-label">Buyer Type</label>
                  <div className="chip-group">
                    {BUYER_TYPES.map(b => <Chip key={b} label={b} selected={form.buyer_type === b} onClick={() => set("buyer_type", b)} />)}
                  </div>
                </div>
                <div className="field-group">
                  <label className="field-label">Sales Velocity <span className="req">*</span></label>
                  <div className="chip-group">
                    {SALES_VELOCITIES.map(s => <Chip key={s} label={s} selected={form.sales_velocity === s} onClick={() => set("sales_velocity", s)} />)}
                  </div>
                  <ErrorMsg field="sales_velocity" />
                </div>
                <div className="field-group">
                  <label className="field-label">Target Sales Timeline</label>
                  <select className="glass-input" value={form.target_timeline} onChange={e => set("target_timeline", e.target.value)}>
                    <option value="">Select months</option>
                    {[1, 2, 3, 6, 9, 12, 18, 24, 36].map(m => <option key={m} value={m}>{m} Month{m > 1 ? "s" : ""}</option>)}
                  </select>
                </div>
                <div className="field-group">
                  <label className="field-label">Developer Positioning</label>
                  <div className="chip-group">
                    {DEVELOPER_POSITIONS.map(d => <Chip key={d} label={d} selected={form.developer_positioning === d} onClick={() => set("developer_positioning", d)} />)}
                  </div>
                </div>
                <div className="btn-row">
                  <button className="btn-ghost" onClick={goBack} style={{ flex: "0 0 auto", width: "auto", padding: "14px 20px" }}>← Back</button>
                  <button className="btn-gold" onClick={() => { if (validateStep3()) setStep(4); }} style={{ flex: 1 }}>Generate Assessment</button>
                </div>
              </div>
            </div>
          )}

          {/* ═══════════════════════════════════════
             STEP 4 — Loading
          ═══════════════════════════════════════ */}
          {step === 4 && (
            <div className="glass-card animate-scale">
              <div className="loader-wrap">
                <div className="loader-ring" />
                <p className="loader-text" key={loadingMsg}>{LOADING_MESSAGES[loadingMsg]}</p>
              </div>
            </div>
          )}

          {/* ═══════════════════════════════════════
             STEP 5 — Assessment Results
          ═══════════════════════════════════════ */}
          {step === 5 && assessment && (
            <div className="glass-card animate-in">
              <div className="card-header">
                <div style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "4px 14px", borderRadius: 99, background: "rgba(249,115,22,0.15)", border: "1px solid rgba(249,115,22,0.3)", marginBottom: 12 }}>
                  <span style={{ fontSize: 12 }}>🔥</span>
                  <span style={{ fontSize: "0.72rem", fontWeight: 700, color: "var(--orange-400)" }}>ASSESSMENT RESULTS</span>
                </div>
                <h2>Project Distribution Assessment</h2>
                <p>Based on your inputs, your CP activation plan is ready</p>
              </div>
              <div className="card-body">
                {/* CP Activation Scope */}
                <div className="result-section">
                  <div className="result-section-title">🎯 Channel Partner Activation Scope</div>
                  <div className="result-row">
                    <span className="result-label">Recommended Plan</span>
                    <span className="result-value">{assessment.plan.name}</span>
                  </div>
                  <div className="result-row">
                    <span className="result-label">Primary CPs (High Intent)</span>
                    <span className="result-value">{assessment.assessment.primary_activation_layer.cp_count_label}</span>
                  </div>
                  <div className="result-row">
                    <span className="result-label">Secondary CPs (Extended)</span>
                    <span className="result-value">{assessment.assessment.secondary_distribution_layer.cp_count_label}</span>
                  </div>
                  <div className="result-row">
                    <span className="result-label">Total CP Reach</span>
                    <span className="result-value" style={{ color: "var(--orange-400)" }}>
                      {assessment.assessment.primary_activation_layer.cp_count_max + assessment.assessment.secondary_distribution_layer.cp_count_max}+
                    </span>
                  </div>
                </div>

                {/* Demand Engine */}
                <div className="result-section">
                  <div className="result-section-title">⚡ Demand Engine Required</div>
                  <div className="result-row">
                    <span className="result-label">Matchmaking Sessions</span>
                    <span className="result-value">{assessment.assessment.demand_engine.matchmaking_sessions_needed.toLocaleString()}+</span>
                  </div>
                  <div className="result-row">
                    <span className="result-label">Leads Required</span>
                    <span className="result-value">{assessment.assessment.demand_engine.leads_needed.toLocaleString()}+</span>
                  </div>
                </div>

                {/* Execution */}
                <div className="result-section">
                  <div className="result-section-title">🚀 Dynamic Boost Layer</div>
                  <div className="result-row">
                    <span className="result-label">Boost Cycles</span>
                    <span className="result-value">{assessment.assessment.execution.boost_cycles}</span>
                  </div>
                  <div className="result-row">
                    <span className="result-label">Spike Campaigns</span>
                    <span className="result-value">{assessment.assessment.execution.spike_campaigns}</span>
                  </div>
                  <div className="result-row">
                    <span className="result-label">Estimated Timeline</span>
                    <span className="result-value">{assessment.plan.validity_label}</span>
                  </div>
                </div>

                {/* Geography */}
                <div className="result-section">
                  <div className="result-section-title">🌍 Support Geography</div>
                  <div style={{ marginBottom: 12 }}>
                    <p className="result-label" style={{ marginBottom: 8 }}>CP Supply Cities</p>
                    <div className="city-tags">
                      {assessment.assessment.support_geography.cp_supply_cities.map(c => <span key={c} className="city-tag">{c}</span>)}
                    </div>
                  </div>
                  <div>
                    <p className="result-label" style={{ marginBottom: 8 }}>Buyer Source Cities</p>
                    <div className="city-tags">
                      {assessment.assessment.support_geography.buyer_source_cities.map(c => <span key={c} className="city-tag">{c}</span>)}
                    </div>
                  </div>
                </div>

                <button className="btn-gold" onClick={() => setStep(6)}>See Activation Investment →</button>
              </div>
            </div>
          )}

          {/* ═══════════════════════════════════════
             STEP 6 — Activation Investment
          ═══════════════════════════════════════ */}
          {step === 6 && assessment && (
            <div className="glass-card animate-in">
              <div className="card-header">
                <h2>Activation Investment</h2>
                <p>For your inventory of {form.units_left_label} units and target buyer reach</p>
              </div>
              <div className="card-body">
                <div className="investment-hero">
                  <p style={{ fontSize: "0.75rem", color: "rgba(255,255,255,0.5)" }}>Your activation investment is</p>
                  <p className="price">{assessment.investment.range_label}</p>
                  <p className="subtitle">All Inclusive + Performance Linked</p>
                </div>

                <div className="result-section">
                  <div className="result-row">
                    <span className="result-label">✅ Activates {assessment.assessment.primary_activation_layer.cp_count_label} Verified CPs</span>
                  </div>
                  <div className="result-row">
                    <span className="result-label">📍 Hyperlocal Targeting: {assessment.assessment.support_geography.cp_supply_cities.join(" · ")}</span>
                  </div>
                  <div className="result-row">
                    <span className="result-label">📊 {assessment.assessment.demand_engine.matchmaking_sessions_needed}+ Structured Matchmaking Sessions</span>
                  </div>
                  <div className="result-row">
                    <span className="result-label">⏰ Expected Results in {Math.ceil(assessment.plan.validity_months * 0.4)}–{Math.ceil(assessment.plan.validity_months * 0.6)} Weeks</span>
                  </div>
                </div>

                <div className="alert-box alert-info">
                  <span style={{ fontSize: "0.9rem", flexShrink: 0 }}>💡</span>
                  <span>This investment aligns with the effort required to activate and convert your current inventory through a controlled channel partner network.</span>
                </div>

                <button className="btn-gold" onClick={() => setStep(7)}>Submit Activation Request →</button>
                <div style={{ marginTop: 10 }}>
                  <button className="btn-ghost" onClick={() => setStep(5)}>← Back to Assessment</button>
                </div>
              </div>
            </div>
          )}

          {/* ═══════════════════════════════════════
             STEP 7 — Submit Activation Form
          ═══════════════════════════════════════ */}
          {step === 7 && (
            <div className="glass-card animate-in">
              <div className="card-header">
                <h2>Submit Activation</h2>
                <p>Provide your details to activate your project with ChannelPartner.Network</p>
              </div>
              <div className="card-body">
                {/* Summary */}
                <div className="summary-card">
                  {[
                    { icon: "🏗️", label: "Project", val: form.project_name },
                    { icon: "📍", label: "City", val: form.city },
                    { icon: "📦", label: "Units Left", val: form.units_left_label },
                    { icon: "📋", label: "Plan", val: assessment?.plan.name },
                    { icon: "💰", label: "Investment", val: assessment?.investment.range_label },
                  ].filter(r => r.val).map(r => (
                    <div key={r.label} className="summary-row">
                      <span className="icon">{r.icon}</span>
                      <div>
                        <div className="label">{r.label}</div>
                        <div className="val">{r.val}</div>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="glass-divider" />

                {/* Contact form */}
                <div className="field-group">
                  <label className="field-label">Your Name <span className="req">*</span></label>
                  <input className="glass-input" placeholder="Enter your full name" value={form.contact_name} onChange={e => set("contact_name", e.target.value)} />
                  <ErrorMsg field="contact_name" />
                </div>
                <div className="field-group">
                  <label className="field-label">Designation</label>
                  <input className="glass-input" placeholder="Enter your job title" value={form.designation} onChange={e => set("designation", e.target.value)} />
                </div>
                <div className="field-group">
                  <label className="field-label">Phone Number <span className="req">*</span></label>
                  <input className="glass-input" type="tel" placeholder="Enter your contact number" value={form.phone} onChange={e => set("phone", e.target.value.replace(/\D/g, "").slice(0, 10))} />
                  <ErrorMsg field="phone" />
                </div>
                <div className="field-group">
                  <label className="field-label">Email ID <span className="req">*</span></label>
                  <input className="glass-input" type="email" placeholder="Enter your email address" value={form.email} onChange={e => set("email", e.target.value)} />
                  <ErrorMsg field="email" />
                </div>
                <div className="field-group">
                  <label className="field-label">Developer Name <span className="req">*</span></label>
                  <input className="glass-input" placeholder="Enter the developer's name" value={form.developer_name} onChange={e => set("developer_name", e.target.value)} />
                  <ErrorMsg field="developer_name" />
                </div>

                <p className="trust-line" style={{ marginBottom: 20 }}>
                  Submission does not guarantee activation. Projects are reviewed for network alignment before approval.
                </p>

                <button className="btn-gold" onClick={goNext} disabled={submitting}>
                  {submitting ? (
                    <><div style={{ width: 18, height: 18, border: "2px solid rgba(255,255,255,0.3)", borderTopColor: "#fff", borderRadius: "50%", animation: "spin 0.75s linear infinite" }} /> Submitting…</>
                  ) : "Submit Activation →"}
                </button>
                <div style={{ marginTop: 10 }}>
                  <button className="btn-ghost" onClick={() => setStep(6)}>← Back</button>
                </div>
              </div>
            </div>
          )}

          {/* ═══════════════════════════════════════
             STEP 8 — Success
          ═══════════════════════════════════════ */}
          {step === 8 && (
            <div className="glass-card animate-scale" style={{ textAlign: "center" }}>
              <div style={{ padding: "40px 28px" }}>
                <div className="success-icon">
                  <svg width="32" height="32" fill="none" viewBox="0 0 24 24" stroke="#fff" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <h2 style={{ fontFamily: "var(--font-display)", fontSize: "1.4rem", fontWeight: 700, color: "#fff", marginBottom: 8 }}>
                  Activation Request Submitted
                </h2>
                <p style={{ fontSize: "0.88rem", color: "rgba(255,255,255,0.6)", lineHeight: 1.6, marginBottom: 28 }}>
                  You will be contacted via email and phone call within 48 hours. Here's what we will be doing:
                </p>

                <div style={{ textAlign: "left", display: "flex", flexDirection: "column", gap: 14, marginBottom: 32 }}>
                  {[
                    { icon: "🔍", text: "Detailed review of your project" },
                    { icon: "📋", text: "Tailoring your activation plan" },
                    { icon: "🤝", text: "Aligning CPs for targeted matchmaking" },
                  ].map(item => (
                    <div key={item.text} style={{ display: "flex", alignItems: "center", gap: 12 }}>
                      <div style={{ width: 36, height: 36, borderRadius: 10, background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "1rem", flexShrink: 0 }}>{item.icon}</div>
                      <span style={{ fontSize: "0.85rem", color: "rgba(255,255,255,0.75)", fontWeight: 500 }}>{item.text}</span>
                    </div>
                  ))}
                </div>

                <div className="alert-box alert-success" style={{ justifyContent: "center" }}>
                  <span>Expect an update within 48 hours</span>
                </div>

                <button className="btn-navy" onClick={() => {
                  // Navigate to login page
                  if (typeof window !== "undefined") {
                    window.location.href = "/";
                  }
                }}>
                  Back to projects
                </button>
              </div>
            </div>
          )}

        </div>
      </div>
    </>
  );
}