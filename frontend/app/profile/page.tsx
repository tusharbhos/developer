"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { useAuth } from "@/context/AuthContext";
import { AuthAPI, ProfileUpdatePayload } from "@/lib/api";
import { isStrongPassword, PASSWORD_POLICY_ERROR } from "@/lib/passwordPolicy";

type Step = 1 | 2 | 3;

type ProfileForm = {
  name: string;
  company_name: string;
  developer_name: string;
  company_size: string;
  profile_image_url: string;
  rera_no: string;
  gst_no: string;
  phone: string;
  city: string;
  address: string;
  experience_level: string;
  primary_market: string[];
  budget_segments: string[];
  max_ticket_size: string;
  buyer_types: string[];
  project_preference: string[];
  micro_markets: string;
  sell_cities: string;
  avg_leads_per_month: string;
  avg_site_visits_per_month: string;
  avg_closures_per_month: string;
  selling_style: string[];
};

const budgetOptions = [
  "Affordable",
  "Regular (50L-1.5CR)",
  "Premium (1.5CR-5CR)",
  "Luxury (5CR-10CR)",
  "Ultra Luxury (10CR+)",
];
const buyerTypeOptions = ["End Users", "Investors", "NRIs", "Mix"];
const projectPreferenceOptions = [
  "New Launch",
  "Pre Launch",
  "Under Construction",
  "Nearing Possession",
  "Ready to Move",
];
const monthlyVolumeOptions = [
  { label: "1-5", value: "5" },
  { label: "5-15", value: "15" },
  { label: "15-50", value: "50" },
  { label: "50-100", value: "100" },
  { label: "100-200", value: "200" },
  { label: "200-500", value: "500" },
  { label: "500+", value: "501" },
];

const companySizeOptions = [
  { label: "Individual", value: "individual" },
  { label: "1-2", value: "1-2" },
  { label: "5-10", value: "5-10" },
  { label: "10-20", value: "10-20" },
  { label: "20-50", value: "20-50" },
  { label: "50-100", value: "50-100" },
  { label: "100+", value: "100+" },
];

const primaryMarketOptions = [
  { label: "Primary New Property", value: "newProperty" },
  { label: "Secondary Re-sale", value: "secondaryResale" },
  { label: "Residential", value: "residential" },
  { label: "Commercial", value: "commercial" },
  { label: "To Commercial Leasing", value: "to_commercial_leasing" },
  { label: "Preleased Commercial", value: "preleased_commercial" },
  { label: "Preleased Residential", value: "preleased_residential" },
  { label: "Residential Rental", value: "residential_rental" },
  { label: "Mandate", value: "mandate" },
  { label: "Weekend home", value: "weekend_home" },
  { label: "Retirement home", value: "retirement_home" },
  { label: "Farmhouse", value: "farmhouse" },
  { label: "NA Plots", value: "na_plots" },
];

const sellingStyleOptions = [
  { label: "Generate your own leads", value: "own_leads" },
  { label: "Work on developer leads", value: "developer_leads" },
  { label: "Referral", value: "referral" },
  {
    label: "Channel Partner Collaboration",
    value: "channel_partner",
  },
  { label: "Through Portal (Magicbricks, etc)", value: "portal" },
];

type MultiSelectOption = {
  label: string;
  value: string;
};

function SearchableMultiDropdown({
  label,
  options,
  selected,
  onChange,
}: {
  label: string;
  options: MultiSelectOption[];
  selected: string[];
  onChange: (values: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const onDocClick = (event: MouseEvent) => {
      if (!dropdownRef.current) return;
      if (!dropdownRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };

    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  const selectedOptions = useMemo(
    () =>
      selected
        .map((value) => options.find((opt) => opt.value === value))
        .filter((opt): opt is MultiSelectOption => Boolean(opt)),
    [options, selected],
  );

  const toggleValue = (value: string) => {
    const exists = selected.includes(value);
    onChange(
      exists ? selected.filter((item) => item !== value) : [...selected, value],
    );
  };

  const removeValue = (value: string) => {
    onChange(selected.filter((item) => item !== value));
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        type="button"
        className="auth-form-input"
        onClick={() => setOpen((prev) => !prev)}
      >
        <div className="flex-1 min-w-0">
          {selectedOptions.length === 0 ? (
            <span className="truncate auth-text-muted block">
              {`Select ${label.toLowerCase()}`}
            </span>
          ) : (
            <div className="flex items-center gap-1 overflow-x-auto whitespace-nowrap scrollbar-hide">
              {selectedOptions.slice(0, 2).map((opt) => (
                <span
                  key={opt.value}
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-blue-100 text-blue-700"
                  onClick={(e) => e.stopPropagation()}
                >
                  {opt.label}
                  <span
                    className="cursor-pointer text-[11px] leading-none"
                    onClick={(e) => {
                      e.stopPropagation();
                      removeValue(opt.value);
                    }}
                    aria-label={`Remove ${opt.label}`}
                  >
                    ×
                  </span>
                </span>
              ))}
              {selectedOptions.length > 2 && (
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs bg-gray-100 text-gray-600">
                  +{selectedOptions.length - 2}
                </span>
              )}
            </div>
          )}
        </div>
        <svg
          className="w-4 h-4 opacity-60 shrink-0 transition-transform duration-200"
          style={{ transform: open ? "rotate(180deg)" : "rotate(0deg)" }}
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M19 9l-7 7-7-7"
          />
        </svg>
      </button>

      {open && (
        <div className="absolute z-30 mt-1 w-full rounded-xl border border-gray-200 bg-white shadow-lg overflow-hidden">
          <div className="max-h-56 overflow-y-auto p-2 space-y-1">
            {options.map((opt) => (
              <label
                key={opt.value}
                className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-gray-50 cursor-pointer text-sm"
              >
                <input
                  type="checkbox"
                  checked={selected.includes(opt.value)}
                  onChange={() => toggleValue(opt.value)}
                />
                <span>{opt.label}</span>
              </label>
            ))}
          </div>

          <div className="flex items-center justify-between p-2 border-t border-gray-100">
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => onChange([])}
            >
              Clear
            </button>
            <button
              type="button"
              className="btn btn-gold"
              onClick={() => setOpen(false)}
            >
              Done
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function toCompanySizeLabel(value: string): string {
  const found = companySizeOptions.find((opt) => opt.value === value);
  return found ? found.label : value || "-";
}

function toVolumeLabel(value: string): string {
  const found = monthlyVolumeOptions.find((opt) => opt.value === value);
  return found ? found.label : "-";
}

function parseMultiSelectValue(
  value: string | string[] | null | undefined,
): string[] {
  if (!value) return [];
  if (Array.isArray(value)) return value.filter(Boolean);
  return value
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);
}

function normalizeBudgetSegments(
  values: string[] | null | undefined,
): string[] {
  if (!values?.length) return [];

  const legacyToNew: Record<string, string> = {
    "<50L": "Affordable",
    "50L-1.5CR": "Regular (50L-1.5CR)",
    "1.5CR-3CR": "Premium (1.5CR-5CR)",
    "3CR-5CR": "Premium (1.5CR-5CR)",
    "5CR-10CR": "Luxury (5CR-10CR)",
    "10CR-25CR": "Ultra Luxury (10CR+)",
    "25CR-50CR": "Ultra Luxury (10CR+)",
    "50CR+": "Ultra Luxury (10CR+)",
  };

  const allowed = new Set(budgetOptions);

  return Array.from(
    new Set(
      values
        .map((value) => legacyToNew[value] ?? value)
        .filter((value) => allowed.has(value)),
    ),
  );
}

function toPrimaryMarketLabel(values: string[]): string {
  if (!values.length) return "-";

  return values
    .map((value) => {
      const found = primaryMarketOptions.find((opt) => opt.value === value);
      return found ? found.label : value;
    })
    .join(", ");
}

function toSellingStyleLabel(values: string[]): string {
  if (!values.length) return "-";

  return values
    .map((value) => {
      const found = sellingStyleOptions.find((opt) => opt.value === value);
      return found ? found.label : value;
    })
    .join(", ");
}

export default function ProfilePage() {
  const { user, isAuthenticated, isLoading, refreshUser } = useAuth();
  const router = useRouter();
  const roleProfileMode = useMemo(
    () =>
      ["developer_super_admin", "sourcing_admin", "sales_user"].includes(
        user?.role || "",
      ),
    [user?.role],
  );
  const [step, setStep] = useState<Step>(1);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [showSummary, setShowSummary] = useState(false);
  const initializedRef = useRef(false);
  const [profileImageFile, setProfileImageFile] = useState<File | null>(null);
  const [profileImagePreview, setProfileImagePreview] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirmation, setPasswordConfirmation] = useState("");

  const [form, setForm] = useState<ProfileForm>(() => ({
    name: user?.name ?? "",
    company_name: user?.company_name ?? "",
    developer_name: user?.developer_name ?? user?.company_name ?? "",
    company_size: user?.company_size ?? "",
    profile_image_url: user?.profile_image_url ?? "",
    rera_no: user?.rera_no ?? "",
    gst_no: user?.gst_no ?? "",
    phone: user?.phone ?? "",
    city: user?.city ?? "",
    address: user?.address ?? "",
    experience_level: user?.experience_level ?? "",
    primary_market: parseMultiSelectValue(user?.primary_market),
    budget_segments: normalizeBudgetSegments(user?.budget_segments),
    max_ticket_size: user?.max_ticket_size ? String(user.max_ticket_size) : "",
    buyer_types: user?.buyer_types ?? [],
    project_preference: user?.project_preference ?? [],
    micro_markets: user?.micro_markets ?? "",
    sell_cities: user?.sell_cities ?? "",
    avg_leads_per_month: user?.avg_leads_per_month
      ? String(user.avg_leads_per_month)
      : "",
    avg_site_visits_per_month: user?.avg_site_visits_per_month
      ? String(user.avg_site_visits_per_month)
      : "",
    avg_closures_per_month: user?.avg_closures_per_month
      ? String(user.avg_closures_per_month)
      : "",
    selling_style: parseMultiSelectValue(user?.selling_style),
  }));

  useEffect(() => {
    if (!user) return;

    if (!initializedRef.current) {
      setShowSummary(true);
      initializedRef.current = true;
    }

    setForm({
      name: user.name ?? "",
      company_name: user.company_name ?? "",
      developer_name: user.developer_name ?? user.company_name ?? "",
      company_size: user.company_size ?? "",
      profile_image_url: user.profile_image_url ?? "",
      rera_no: user.rera_no ?? "",
      gst_no: user.gst_no ?? "",
      phone: user.phone ?? "",
      city: user.city ?? "",
      address: user.address ?? "",
      experience_level: user.experience_level ?? "",
      primary_market: parseMultiSelectValue(user.primary_market),
      budget_segments: normalizeBudgetSegments(user.budget_segments),
      max_ticket_size: user.max_ticket_size ? String(user.max_ticket_size) : "",
      buyer_types: user.buyer_types ?? [],
      project_preference: user.project_preference ?? [],
      micro_markets: user.micro_markets ?? "",
      sell_cities: user.sell_cities ?? "",
      avg_leads_per_month: user.avg_leads_per_month
        ? String(user.avg_leads_per_month)
        : "",
      avg_site_visits_per_month: user.avg_site_visits_per_month
        ? String(user.avg_site_visits_per_month)
        : "",
      avg_closures_per_month: user.avg_closures_per_month
        ? String(user.avg_closures_per_month)
        : "",
      selling_style: parseMultiSelectValue(user.selling_style),
    });
    setProfileImageFile(null);
    setProfileImagePreview(user.profile_image_url ?? "");
    if (user.onboarding_step && [1, 2, 3].includes(user.onboarding_step)) {
      setStep(user.onboarding_step as Step);
    }
  }, [user]);

  const canAccess = useMemo(
    () => !isLoading && isAuthenticated,
    [isLoading, isAuthenticated],
  );

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.replace("/");
    }
  }, [isLoading, isAuthenticated, router]);

  const setValue = <K extends keyof ProfileForm>(
    key: K,
    value: ProfileForm[K],
  ) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setMessage("");
  };

  const saveStep = async (targetStep?: Step) => {
    if (!user) return;

    const normalizedPhone = form.phone.replace(/\D/g, "").slice(0, 10);
    if (normalizedPhone.length !== 10) {
      setMessage("Please enter a valid 10-digit mobile number.");
      return;
    }

    if (password || passwordConfirmation) {
      if (!isStrongPassword(password)) {
        setMessage(PASSWORD_POLICY_ERROR);
        return;
      }

      if (password !== passwordConfirmation) {
        setMessage("Password and confirm password must match.");
        return;
      }
    }

    const payload = new FormData();
    payload.append("name", form.name);
    payload.append("company_name", form.developer_name || form.company_name);
    if (form.developer_name)
      payload.append("developer_name", form.developer_name);
    if (form.company_size) payload.append("company_size", form.company_size);
    payload.append("rera_no", form.rera_no);
    if (form.gst_no) payload.append("gst_no", form.gst_no);
    payload.append("phone", normalizedPhone);
    payload.append("city", form.city);
    payload.append("address", form.address);
    if (form.experience_level)
      payload.append("experience_level", form.experience_level);
    form.primary_market.forEach((value) =>
      payload.append("primary_market[]", value),
    );
    form.budget_segments.forEach((value) =>
      payload.append("budget_segments[]", value),
    );
    if (form.max_ticket_size)
      payload.append("max_ticket_size", String(Number(form.max_ticket_size)));
    form.buyer_types.forEach((value) => payload.append("buyer_types[]", value));
    form.project_preference.forEach((value) =>
      payload.append("project_preference[]", value),
    );
    if (form.micro_markets) payload.append("micro_markets", form.micro_markets);
    if (form.sell_cities) payload.append("sell_cities", form.sell_cities);
    if (form.avg_leads_per_month)
      payload.append("avg_leads_per_month", form.avg_leads_per_month);
    if (form.avg_site_visits_per_month)
      payload.append(
        "avg_site_visits_per_month",
        form.avg_site_visits_per_month,
      );
    if (form.avg_closures_per_month)
      payload.append("avg_closures_per_month", form.avg_closures_per_month);
    form.selling_style.forEach((value) =>
      payload.append("selling_style[]", value),
    );
    payload.append("onboarding_step", String(targetStep ?? step));
    if (profileImageFile) payload.append("profile_image", profileImageFile);
    if (password) {
      payload.append("password", password);
      payload.append("password_confirmation", passwordConfirmation);
    }

    setSaving(true);
    try {
      await AuthAPI.updateProfile(payload);
      await refreshUser();
      setMessage("Saved successfully.");
      setPassword("");
      setPasswordConfirmation("");
      if (roleProfileMode) {
        setShowSummary(false);
        return;
      }
      if (targetStep) {
        setShowSummary(false);
        setStep(targetStep);
      } else {
        setStep(3);
        setShowSummary(true);
      }
    } catch (error: unknown) {
      const e = error as {
        message?: string;
        errors?: Record<string, string[]>;
      };

      if (e.errors && typeof e.errors === "object") {
        const firstKey = Object.keys(e.errors)[0];
        if (firstKey && e.errors[firstKey]?.[0]) {
          setMessage(e.errors[firstKey][0]);
          return;
        }
      }

      setMessage(e.message || "Save failed. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  if (!canAccess) {
    return (
      <div className="page-loader">
        <div className="spinner spinner-lg" />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-main">
      <Header variant="app" />
      <main className="flex-1" style={{ paddingTop: "var(--header-height)" }}>
        <div className="max-w-3xl mx-auto px-4 py-6">
          <div className="glass-card p-5 md:p-7">
            <h1
              className="text-xl font-bold mb-2"
              style={{
                color: "var(--color-text-primary)",
                fontFamily: "var(--font-display)",
              }}
            >
              Help us show you better projects
            </h1>
            <p className="text-sm auth-text-muted mb-5">
              {roleProfileMode
                ? "Profile & Password Settings"
                : showSummary
                  ? "Profile Summary"
                  : `Step ${step} of 3`}
            </p>

            {roleProfileMode && (
              <div className="space-y-5">
                <div
                  className="grid grid-cols-1 lg:grid-cols-[300px_1fr] gap-5"
                  style={{ alignItems: "start" }}
                >
                  {/* Left Panel: Profile Photo + Role Badge */}
                  <div
                    className="rounded-2xl p-4"
                    style={{
                      border: "1px solid var(--slate-200)",
                      background: "#fff",
                    }}
                  >
                    <div className="text-center">
                      <div
                        style={{
                          width: 100,
                          height: 100,
                          borderRadius: 999,
                          overflow: "hidden",
                          background: "var(--navy-50)",
                          border: "3px solid var(--gold-400)",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          margin: "0 auto 12px",
                          flexShrink: 0,
                        }}
                      >
                        {profileImagePreview ? (
                          <img
                            src={profileImagePreview}
                            alt="Profile preview"
                            style={{
                              width: "100%",
                              height: "100%",
                              objectFit: "cover",
                            }}
                          />
                        ) : (
                          <span
                            style={{
                              fontSize: "2.5rem",
                              fontWeight: 800,
                              color: "var(--navy-700)",
                            }}
                          >
                            {form.name?.trim()?.charAt(0)?.toUpperCase() || "U"}
                          </span>
                        )}
                      </div>
                      <p
                        className="font-bold text-sm mb-1"
                        style={{ color: "var(--navy-900)" }}
                      >
                        {form.name || "User"}
                      </p>
                      <span
                        className="inline-block text-xs px-3 py-1 rounded-full font-semibold"
                        style={{
                          background: "var(--gold-100)",
                          color: "var(--gold-700)",
                          textTransform: "capitalize",
                        }}
                      >
                        {user?.role?.replace(/_/g, " ")}
                      </span>
                    </div>

                    <label className="auth-form-label mt-5">
                      Profile Photo
                    </label>
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/jpg,image/webp"
                      className="auth-form-input"
                      onChange={(e) => {
                        const file = e.target.files?.[0] ?? null;
                        setProfileImageFile(file);
                        if (file) {
                          setProfileImagePreview(URL.createObjectURL(file));
                        } else {
                          setProfileImagePreview(form.profile_image_url || "");
                        }
                      }}
                    />
                    <p
                      className="text-xs mt-1"
                      style={{ color: "var(--color-text-muted)" }}
                    >
                      JPG, PNG or WEBP (max 2MB)
                    </p>

                    {user?.assigned_projects?.length ? (
                      <div className="mt-4">
                        <p
                          className="text-xs font-bold mb-2"
                          style={{ color: "var(--navy-700)" }}
                        >
                          📋 Assigned Projects
                        </p>
                        <div className="max-h-48 overflow-y-auto space-y-1 pr-1">
                          {user.assigned_projects.map((project) => (
                            <div
                              key={project}
                              className="text-xs px-2.5 py-1.5 rounded-lg"
                              style={{
                                background: "var(--navy-50)",
                                color: "var(--navy-700)",
                                border: "1px solid var(--navy-100)",
                              }}
                            >
                              {project}
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : null}
                  </div>

                  {/* Right Panel: Role-Specific Form */}
                  <div
                    className="rounded-2xl p-4"
                    style={{
                      border: "1px solid var(--slate-200)",
                      background: "#fff",
                    }}
                  >
                    {/* Developer Super Admin - Same as create form (without unique key) */}
                    {user?.role === "developer_super_admin" && (
                      <>
                        <p
                          className="text-sm font-bold mb-4"
                          style={{ color: "var(--navy-700)" }}
                        >
                          Developer Admin Profile
                        </p>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          <div>
                            <label className="auth-form-label">
                              Manager Name *
                            </label>
                            <input
                              className="auth-form-input"
                              value={form.name}
                              onChange={(e) => setValue("name", e.target.value)}
                              placeholder="Manager Name"
                            />
                          </div>
                          <div>
                            <label className="auth-form-label">
                              Developer / Company Name *
                            </label>
                            <input
                              className="auth-form-input"
                              value={form.developer_name}
                              onChange={(e) =>
                                setValue("developer_name", e.target.value)
                              }
                              placeholder="Developer Name"
                            />
                          </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
                          <div>
                            <label className="auth-form-label">Email *</label>
                            <input
                              className="auth-form-input"
                              type="email"
                              value={user?.email || ""}
                              readOnly
                              placeholder="Email"
                              style={{ background: "var(--slate-50)" }}
                            />
                          </div>
                          <div>
                            <label className="auth-form-label">Phone No</label>
                            <input
                              className="auth-form-input"
                              value={form.phone}
                              onChange={(e) =>
                                setValue(
                                  "phone",
                                  e.target.value
                                    .replace(/\D/g, "")
                                    .slice(0, 10),
                                )
                              }
                              placeholder="10-digit phone"
                            />
                          </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
                          <div>
                            <label className="auth-form-label">RERA No</label>
                            <input
                              className="auth-form-input"
                              value={form.rera_no}
                              onChange={(e) =>
                                setValue("rera_no", e.target.value)
                              }
                              placeholder="RERA Registration No"
                            />
                          </div>
                          <div>
                            <label className="auth-form-label">GST No</label>
                            <input
                              className="auth-form-input"
                              value={form.gst_no}
                              onChange={(e) =>
                                setValue("gst_no", e.target.value.toUpperCase())
                              }
                              placeholder="GST Number"
                            />
                          </div>
                        </div>

                        <div className="mt-4">
                          <label className="auth-form-label">Address</label>
                          <input
                            className="auth-form-input"
                            value={form.address}
                            onChange={(e) =>
                              setValue("address", e.target.value)
                            }
                            placeholder="Address"
                          />
                        </div>
                      </>
                    )}

                    {/* Sourcing Admin - Simplified Profile */}
                    {user?.role === "sourcing_admin" && (
                      <>
                        <p
                          className="text-sm font-bold mb-4"
                          style={{ color: "var(--navy-700)" }}
                        >
                          Sourcing Manager Profile
                        </p>
                        <div className="space-y-4">
                          <div>
                            <label className="auth-form-label">
                              Full Name *
                            </label>
                            <input
                              className="auth-form-input"
                              value={form.name}
                              onChange={(e) => setValue("name", e.target.value)}
                              placeholder="Your full name"
                            />
                          </div>
                          <div>
                            <label className="auth-form-label">Mobile</label>
                            <input
                              className="auth-form-input"
                              value={form.phone}
                              onChange={(e) =>
                                setValue(
                                  "phone",
                                  e.target.value
                                    .replace(/\D/g, "")
                                    .slice(0, 10),
                                )
                              }
                              placeholder="10-digit phone"
                            />
                          </div>
                          <div>
                            <label className="auth-form-label">
                              Office Address
                            </label>
                            <input
                              className="auth-form-input"
                              value={form.address}
                              onChange={(e) =>
                                setValue("address", e.target.value)
                              }
                              placeholder="Office address"
                            />
                          </div>
                        </div>
                      </>
                    )}

                    {/* Sales User - Minimal Profile */}
                    {user?.role === "sales_user" && (
                      <>
                        <p
                          className="text-sm font-bold mb-4"
                          style={{ color: "var(--navy-700)" }}
                        >
                          Sales User Profile
                        </p>
                        <div className="space-y-4">
                          <div>
                            <label className="auth-form-label">
                              Full Name *
                            </label>
                            <input
                              className="auth-form-input"
                              value={form.name}
                              onChange={(e) => setValue("name", e.target.value)}
                              placeholder="Your full name"
                            />
                          </div>
                          <div>
                            <label className="auth-form-label">Mobile</label>
                            <input
                              className="auth-form-input"
                              value={form.phone}
                              onChange={(e) =>
                                setValue(
                                  "phone",
                                  e.target.value
                                    .replace(/\D/g, "")
                                    .slice(0, 10),
                                )
                              }
                              placeholder="10-digit phone"
                            />
                          </div>
                          <div>
                            <label className="auth-form-label">Address</label>
                            <input
                              className="auth-form-input"
                              value={form.address}
                              onChange={(e) =>
                                setValue("address", e.target.value)
                              }
                              placeholder="Your address"
                            />
                          </div>
                        </div>
                      </>
                    )}

                    {/* Change Password - Common for all roles */}
                    <div
                      className="mt-5 pt-4"
                      style={{ borderTop: "1px solid var(--slate-200)" }}
                    >
                      <p
                        className="text-sm font-bold mb-3"
                        style={{ color: "var(--navy-700)" }}
                      >
                        🔐 Change Password
                      </p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                          <label className="auth-form-label">
                            New Password
                          </label>
                          <input
                            type="password"
                            className="auth-form-input"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            placeholder="Enter new password"
                          />
                        </div>
                        <div>
                          <label className="auth-form-label">
                            Confirm Password
                          </label>
                          <input
                            type="password"
                            className="auth-form-input"
                            value={passwordConfirmation}
                            onChange={(e) =>
                              setPasswordConfirmation(e.target.value)
                            }
                            placeholder="Confirm password"
                          />
                        </div>
                      </div>
                      <p
                        className="text-xs mt-2"
                        style={{ color: "var(--color-text-muted)" }}
                      >
                        Min 8 chars: 1 uppercase, 1 number, 1 symbol
                      </p>
                    </div>

                    {/* Action Buttons */}
                    <div className="flex flex-col sm:flex-row gap-3 mt-5">
                      <button
                        className="btn btn-gold flex-1 sm:flex-none"
                        disabled={saving}
                        onClick={() => saveStep()}
                      >
                        {saving ? "Saving..." : "Save Profile"}
                      </button>
                      <button
                        className="btn btn-ghost flex-1 sm:flex-none"
                        onClick={() => router.push("/home")}
                      >
                        Back to Home
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {!roleProfileMode && showSummary && (
              <div className="space-y-4">
                <div className="overflow-x-auto rounded-xl border border-gray-200">
                  <table className="w-full text-sm">
                    <tbody>
                      <tr className="border-b border-gray-100">
                        <th className="w-44 px-3 py-2 text-left font-semibold text-gray-700">
                          Name
                        </th>
                        <td className="px-3 py-2">{form.name || "-"}</td>
                      </tr>
                      <tr className="border-b border-gray-100">
                        <th className="px-3 py-2 text-left font-semibold text-gray-700">
                          Mobile
                        </th>
                        <td className="px-3 py-2">{form.phone || "-"}</td>
                      </tr>
                      <tr className="border-b border-gray-100">
                        <th className="px-3 py-2 text-left font-semibold text-gray-700">
                          Company Name
                        </th>
                        <td className="px-3 py-2">
                          {form.company_name || "-"}
                        </td>
                      </tr>
                      <tr className="border-b border-gray-100">
                        <th className="px-3 py-2 text-left font-semibold text-gray-700">
                          Company Size
                        </th>
                        <td className="px-3 py-2">
                          {toCompanySizeLabel(form.company_size)}
                        </td>
                      </tr>
                      <tr className="border-b border-gray-100">
                        <th className="px-3 py-2 text-left font-semibold text-gray-700">
                          Profile Image
                        </th>
                        <td className="px-3 py-2">
                          {profileImagePreview ? (
                            <img
                              src={profileImagePreview}
                              alt="Profile"
                              style={{
                                width: 56,
                                height: 56,
                                objectFit: "cover",
                                borderRadius: 999,
                                display: "inline-block",
                                verticalAlign: "middle",
                                border: "2px solid var(--navy-100)",
                              }}
                            />
                          ) : (
                            "-"
                          )}
                        </td>
                      </tr>
                      <tr className="border-b border-gray-100">
                        <th className="px-3 py-2 text-left font-semibold text-gray-700">
                          RERA No
                        </th>
                        <td className="px-3 py-2">{form.rera_no || "-"}</td>
                      </tr>
                      <tr className="border-b border-gray-100">
                        <th className="px-3 py-2 text-left font-semibold text-gray-700">
                          City
                        </th>
                        <td className="px-3 py-2">{form.city || "-"}</td>
                      </tr>
                      <tr className="border-b border-gray-100">
                        <th className="px-3 py-2 text-left font-semibold text-gray-700">
                          Address
                        </th>
                        <td className="px-3 py-2">{form.address || "-"}</td>
                      </tr>
                      <tr className="border-b border-gray-100">
                        <th className="px-3 py-2 text-left font-semibold text-gray-700">
                          Experience
                        </th>
                        <td className="px-3 py-2">
                          {form.experience_level || "-"}
                        </td>
                      </tr>
                      <tr className="border-b border-gray-100">
                        <th className="px-3 py-2 text-left font-semibold text-gray-700">
                          Segment Expertise
                        </th>
                        <td className="px-3 py-2">
                          {toPrimaryMarketLabel(form.primary_market)}
                        </td>
                      </tr>
                      <tr className="border-b border-gray-100">
                        <th className="px-3 py-2 text-left font-semibold text-gray-700">
                          Budget Expertise
                        </th>
                        <td className="px-3 py-2">
                          {form.budget_segments.length
                            ? form.budget_segments.join(", ")
                            : "-"}
                        </td>
                      </tr>
                      <tr className="border-b border-gray-100">
                        <th className="px-3 py-2 text-left font-semibold text-gray-700">
                          Max Ticket Size Handled
                        </th>
                        <td className="px-3 py-2">
                          {form.max_ticket_size || "-"}
                        </td>
                      </tr>
                      <tr className="border-b border-gray-100">
                        <th className="px-3 py-2 text-left font-semibold text-gray-700">
                          Buyer Type
                        </th>
                        <td className="px-3 py-2">
                          {form.buyer_types.length
                            ? form.buyer_types.join(", ")
                            : "-"}
                        </td>
                      </tr>
                      <tr className="border-b border-gray-100">
                        <th className="px-3 py-2 text-left font-semibold text-gray-700">
                          Avg Leads/Month
                        </th>
                        <td className="px-3 py-2">
                          {toVolumeLabel(form.avg_leads_per_month)}
                        </td>
                      </tr>
                      <tr className="border-b border-gray-100">
                        <th className="px-3 py-2 text-left font-semibold text-gray-700">
                          Avg Site Visits/Month
                        </th>
                        <td className="px-3 py-2">
                          {toVolumeLabel(form.avg_site_visits_per_month)}
                        </td>
                      </tr>
                      <tr className="border-b border-gray-100">
                        <th className="px-3 py-2 text-left font-semibold text-gray-700">
                          Avg Closures/Month
                        </th>
                        <td className="px-3 py-2">
                          {toVolumeLabel(form.avg_closures_per_month)}
                        </td>
                      </tr>
                      <tr className="border-b border-gray-100">
                        <th className="px-3 py-2 text-left font-semibold text-gray-700">
                          Selling Style
                        </th>
                        <td className="px-3 py-2">
                          {toSellingStyleLabel(form.selling_style)}
                        </td>
                      </tr>
                      <tr className="border-b border-gray-100">
                        <th className="px-3 py-2 text-left font-semibold text-gray-700">
                          Project Preference
                        </th>
                        <td className="px-3 py-2">
                          {form.project_preference.length
                            ? form.project_preference.join(", ")
                            : "-"}
                        </td>
                      </tr>
                      <tr className="border-b border-gray-100">
                        <th className="px-3 py-2 text-left font-semibold text-gray-700">
                          Micro-markets
                        </th>
                        <td className="px-3 py-2">
                          {form.micro_markets || "-"}
                        </td>
                      </tr>
                      <tr>
                        <th className="px-3 py-2 text-left font-semibold text-gray-700">
                          Selling Cities
                        </th>
                        <td className="px-3 py-2">{form.sell_cities || "-"}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                <div className="flex gap-3">
                  <button
                    className="btn btn-gold"
                    onClick={() => {
                      setShowSummary(false);
                      setStep(1);
                    }}
                  >
                    Update Profile
                  </button>
                  <button
                    className="btn btn-ghost"
                    onClick={() => router.push("/customer")}
                  >
                    Go to Customer
                  </button>
                </div>
              </div>
            )}

            {!roleProfileMode && !showSummary && step === 1 && (
              <div className="space-y-4">
                <div
                  className="flex items-center gap-4 p-3 rounded-xl"
                  style={{
                    background: "rgba(255,255,255,0.55)",
                    border: "1px solid rgba(255,255,255,0.45)",
                  }}
                >
                  <div
                    style={{
                      width: 72,
                      height: 72,
                      borderRadius: 999,
                      overflow: "hidden",
                      background: "var(--navy-50)",
                      border: "2px solid var(--navy-100)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      flexShrink: 0,
                    }}
                  >
                    {profileImagePreview ? (
                      <img
                        src={profileImagePreview}
                        alt="Profile preview"
                        style={{
                          width: "100%",
                          height: "100%",
                          objectFit: "cover",
                        }}
                      />
                    ) : (
                      <span
                        style={{
                          fontSize: "1.4rem",
                          fontWeight: 800,
                          color: "var(--navy-700)",
                        }}
                      >
                        {form.name?.trim()?.charAt(0)?.toUpperCase() || "U"}
                      </span>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <label className="auth-form-label">Profile Image</label>
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/jpg,image/webp"
                      className="auth-form-input"
                      onChange={(e) => {
                        const file = e.target.files?.[0] ?? null;
                        setProfileImageFile(file);
                        if (file) {
                          setProfileImagePreview(URL.createObjectURL(file));
                        } else {
                          setProfileImagePreview(form.profile_image_url || "");
                        }
                      }}
                    />
                    <p
                      className="text-xs mt-1"
                      style={{ color: "var(--color-text-muted)" }}
                    >
                      Upload JPG, PNG or WEBP up to 2MB.
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="auth-form-label">Name</label>
                    <input
                      className="auth-form-input"
                      value={form.name}
                      onChange={(e) => setValue("name", e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="auth-form-label">Mobile</label>
                    <input
                      className="auth-form-input"
                      value={form.phone}
                      onChange={(e) =>
                        setValue(
                          "phone",
                          e.target.value.replace(/\D/g, "").slice(0, 10),
                        )
                      }
                    />
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="auth-form-label">City</label>
                    <input
                      className="auth-form-input"
                      value={form.city}
                      onChange={(e) => setValue("city", e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="auth-form-label">Company Name</label>
                    <input
                      className="auth-form-input"
                      value={form.company_name}
                      onChange={(e) => setValue("company_name", e.target.value)}
                    />
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="auth-form-label">Company Size</label>
                    <select
                      className="auth-form-input"
                      value={form.company_size}
                      onChange={(e) => setValue("company_size", e.target.value)}
                    >
                      <option value="">Select</option>
                      {companySizeOptions.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="auth-form-label">RERA No</label>
                    <input
                      className="auth-form-input"
                      value={form.rera_no}
                      onChange={(e) => setValue("rera_no", e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="auth-form-label">Address</label>
                    <input
                      className="auth-form-input"
                      value={form.address}
                      onChange={(e) => setValue("address", e.target.value)}
                    />
                  </div>
                </div>
                <div className="flex gap-3">
                  <button
                    className="btn btn-gold"
                    disabled={saving}
                    onClick={() => saveStep(2)}
                  >
                    {saving ? "Saving..." : "Save & Next"}
                  </button>
                </div>
              </div>
            )}

            {!roleProfileMode && !showSummary && step === 2 && (
              <div className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="auth-form-label">
                      Experience (in Years)
                    </label>
                    <select
                      className="auth-form-input"
                      value={form.experience_level}
                      onChange={(e) =>
                        setValue("experience_level", e.target.value)
                      }
                    >
                      <option value="">Select</option>
                      <option value="0-2">0-2</option>
                      <option value="2-5">2-5</option>
                      <option value="5-10">5-10</option>
                      <option value="10-15">10-15</option>
                      <option value="15-20">15-20</option>
                      <option value="20+">20+</option>
                    </select>
                  </div>
                  <div>
                    <label className="auth-form-label">Segment Expertise</label>
                    <SearchableMultiDropdown
                      label="Segment Expertise"
                      options={primaryMarketOptions}
                      selected={form.primary_market}
                      onChange={(values) => setValue("primary_market", values)}
                    />
                  </div>
                </div>

                <div>
                  <label className="auth-form-label">Budget Expertise</label>
                  <SearchableMultiDropdown
                    label="Budget Expertise"
                    options={budgetOptions.map((v) => ({ label: v, value: v }))}
                    selected={form.budget_segments}
                    onChange={(values) => setValue("budget_segments", values)}
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="auth-form-label">
                      Max ticket size handled till date
                    </label>
                    <input
                      className="auth-form-input"
                      value={form.max_ticket_size}
                      onChange={(e) =>
                        setValue(
                          "max_ticket_size",
                          e.target.value.replace(/[^0-9.]/g, ""),
                        )
                      }
                    />
                  </div>
                  <div>
                    <label className="auth-form-label">Buyer Type</label>
                    <SearchableMultiDropdown
                      label="Buyer Type"
                      options={buyerTypeOptions.map((v) => ({
                        label: v,
                        value: v,
                      }))}
                      selected={form.buyer_types}
                      onChange={(values) => setValue("buyer_types", values)}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className="auth-form-label">Avg Leads / Month</label>
                    <select
                      className="auth-form-input"
                      value={form.avg_leads_per_month}
                      onChange={(e) =>
                        setValue("avg_leads_per_month", e.target.value)
                      }
                    >
                      <option value="">Select</option>
                      {monthlyVolumeOptions.map((opt) => (
                        <option key={`leads-${opt.value}`} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="auth-form-label">
                      Avg Site Visits / Month
                    </label>
                    <select
                      className="auth-form-input"
                      value={form.avg_site_visits_per_month}
                      onChange={(e) =>
                        setValue("avg_site_visits_per_month", e.target.value)
                      }
                    >
                      <option value="">Select</option>
                      {monthlyVolumeOptions.map((opt) => (
                        <option key={`visits-${opt.value}`} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="auth-form-label">
                      Avg Closures / Month
                    </label>
                    <select
                      className="auth-form-input"
                      value={form.avg_closures_per_month}
                      onChange={(e) =>
                        setValue("avg_closures_per_month", e.target.value)
                      }
                    >
                      <option value="">Select</option>
                      {monthlyVolumeOptions.map((opt) => (
                        <option key={`closures-${opt.value}`} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="flex gap-3">
                  <button
                    className="btn btn-ghost"
                    disabled={saving}
                    onClick={() => setStep(1)}
                  >
                    Back
                  </button>
                  <button
                    className="btn btn-gold"
                    disabled={saving}
                    onClick={() => saveStep(3)}
                  >
                    {saving ? "Saving..." : "Save & Next"}
                  </button>
                </div>
              </div>
            )}

            {!roleProfileMode && !showSummary && step === 3 && (
              <div className="space-y-4">
                <div>
                  <label className="auth-form-label">Selling Style</label>
                  <SearchableMultiDropdown
                    label="Selling Style"
                    options={sellingStyleOptions}
                    selected={form.selling_style}
                    onChange={(values) => setValue("selling_style", values)}
                  />
                </div>

                <div>
                  <label className="auth-form-label">Project Preference</label>
                  <SearchableMultiDropdown
                    label="Project Preference"
                    options={projectPreferenceOptions.map((v) => ({
                      label: v,
                      value: v,
                    }))}
                    selected={form.project_preference}
                    onChange={(values) =>
                      setValue("project_preference", values)
                    }
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="auth-form-label">
                      Micro-markets (comma separated)
                    </label>
                    <input
                      className="auth-form-input"
                      value={form.micro_markets}
                      onChange={(e) =>
                        setValue("micro_markets", e.target.value)
                      }
                    />
                  </div>
                  <div>
                    <label className="auth-form-label">
                      Selling Cities (comma separated)
                    </label>
                    <input
                      className="auth-form-input"
                      value={form.sell_cities}
                      onChange={(e) => setValue("sell_cities", e.target.value)}
                    />
                  </div>
                </div>

                <div className="flex gap-3">
                  <button
                    className="btn btn-ghost"
                    disabled={saving}
                    onClick={() => setStep(2)}
                  >
                    Back
                  </button>
                  <button
                    className="btn btn-gold"
                    disabled={saving}
                    onClick={() => saveStep()}
                  >
                    {saving ? "Saving..." : "Submit Profile"}
                  </button>
                </div>
              </div>
            )}

            {message && (
              <div
                className={`alert mt-4 ${message.includes("failed") ? "alert-danger" : "alert-success"}`}
              >
                {message}
              </div>
            )}
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}
