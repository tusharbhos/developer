"use client";

import React, { ChangeEvent, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { useAuth } from "@/context/AuthContext";
import { AuthAPI, ProfileUpdatePayload, getApiBaseUrl } from "@/lib/api";
import { isStrongPassword, PASSWORD_POLICY_ERROR } from "@/lib/passwordPolicy";

type StepId = "personal" | "company" | "business" | "image" | "password";

type ProfileForm = {
  name: string;
  company_name: string;
  developer_name: string;
  company_size: string;
  rera_no: string;
  gst_no: string;
  phone: string;
  city: string;
  state: string;
  pincode: string;
  address: string;
  experience_level: string;
  primary_market: string;
  micro_markets: string;
  sell_cities: string;
  avg_leads_per_month: string;
  avg_site_visits_per_month: string;
  avg_closures_per_month: string;
};

const steps: Array<{
  id: StepId;
  title: string;
  subtitle: string;
  eyebrow: string;
}> = [
  {
    id: "personal",
    title: "Personal Details",
    subtitle: "Contact and address",
    eyebrow: "Your basic information",
  },
  {
    id: "company",
    title: "Company Details",
    subtitle: "Company and RERA",
    eyebrow: "Business identity",
  },
  {
    id: "business",
    title: "Business Profile",
    subtitle: "Experience and activity",
    eyebrow: "Your market activity",
  },
  {
    id: "image",
    title: "Profile Image",
    subtitle: "Photo and account status",
    eyebrow: "Your public appearance",
  },
  {
    id: "password",
    title: "Change Password",
    subtitle: "Account security",
    eyebrow: "Secure your account",
  },
];

const companySizeOptions = [
  ["individual", "Individual"],
  ["1-2", "1-2 people"],
  ["5-10", "5-10 people"],
  ["10-20", "10-20 people"],
  ["20-50", "20-50 people"],
  ["50-100", "50-100 people"],
  ["100+", "100+ people"],
];

const experienceOptions = [
  ["", "Select experience"],
  ["0-1", "Less than 1 year"],
  ["1-3", "1-3 years"],
  ["3-5", "3-5 years"],
  ["5-10", "5-10 years"],
  ["10+", "10+ years"],
];

function initials(name: string): string {
  return (
    name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part.charAt(0).toUpperCase())
      .join("") || "U"
  );
}

function numberValue(value: string): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

function resolveProfileImageUrl(value?: string | null): string {
  const raw = (value ?? "").trim();
  if (!raw) return "";
  if (raw.startsWith("blob:") || raw.startsWith("data:")) return raw;

  const apiBase = getApiBaseUrl().replace(/\/api\/?$/, "");

  if (/^https?:\/\//i.test(raw)) {
    try {
      const url = new URL(raw);
      if (
        /^(localhost|127\.0\.0\.1)$/i.test(url.hostname) &&
        url.pathname.startsWith("/storage/")
      ) {
        return `${apiBase}${url.pathname}${url.search}`;
      }
    } catch {
      return raw;
    }
    return raw;
  }

  const path = raw.startsWith("/")
    ? raw
    : raw.startsWith("storage/")
      ? `/${raw}`
      : `/storage/${raw}`;
  return `${apiBase}${path}`;
}

export default function ProfilePage() {
  const { user, isAuthenticated, isLoading, refreshUser } = useAuth();
  const router = useRouter();
  const [activeStep, setActiveStep] = useState<StepId>("personal");
  const [savingStep, setSavingStep] = useState<StepId | null>(null);
  const [message, setMessage] = useState("");
  const [isError, setIsError] = useState(false);
  const [profileImageFile, setProfileImageFile] = useState<File | null>(null);
  const [profileImagePreview, setProfileImagePreview] = useState("");
  const [profileImageBroken, setProfileImageBroken] = useState(false);
  const [password, setPassword] = useState("");
  const [passwordConfirmation, setPasswordConfirmation] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [form, setForm] = useState<ProfileForm>({
    name: "",
    company_name: "",
    developer_name: "",
    company_size: "",
    rera_no: "",
    gst_no: "",
    phone: "",
    city: "",
    state: "",
    pincode: "",
    address: "",
    experience_level: "",
    primary_market: "",
    micro_markets: "",
    sell_cities: "",
    avg_leads_per_month: "",
    avg_site_visits_per_month: "",
    avg_closures_per_month: "",
  });

  useEffect(() => {
    if (!isLoading && !isAuthenticated) router.replace("/");
  }, [isAuthenticated, isLoading, router]);

  useEffect(() => {
    if (!user) return;
    setForm({
      name: user.name ?? "",
      company_name: user.company_name ?? "",
      developer_name: user.developer_name ?? "",
      company_size: user.company_size ?? "",
      rera_no: user.rera_no ?? "",
      gst_no: user.gst_no ?? "",
      phone: user.phone ?? "",
      city: user.city ?? "",
      state: user.state ?? "",
      pincode: user.pincode ?? "",
      address: user.address ?? "",
      experience_level: user.experience_level ?? "",
      primary_market: (user.primary_market ?? []).join(", "),
      micro_markets: user.micro_markets ?? "",
      sell_cities: user.sell_cities ?? "",
      avg_leads_per_month: String(user.avg_leads_per_month ?? ""),
      avg_site_visits_per_month: String(
        user.avg_site_visits_per_month ?? "",
      ),
      avg_closures_per_month: String(user.avg_closures_per_month ?? ""),
    });
    setProfileImagePreview(
      resolveProfileImageUrl(user.profile_image_url || user.profile_image),
    );
    setProfileImageBroken(false);
    setProfileImageFile(null);
  }, [user]);

  useEffect(() => {
    return () => {
      if (profileImagePreview.startsWith("blob:")) {
        URL.revokeObjectURL(profileImagePreview);
      }
    };
  }, [profileImagePreview]);

  const activeIndex = steps.findIndex((step) => step.id === activeStep);
  const currentStep = steps[activeIndex];
  const companyLabel =
    user?.role === "developer_super_admin"
      ? "Developer / Company Name"
      : "Company Name";

  const completedSections = useMemo(() => {
    if (!user) return 0;
    const complete = [
      Boolean(user.name && user.phone && user.city && user.address),
      Boolean(user.company_name && user.rera_no),
      Boolean(
        user.experience_level ||
          user.primary_market?.length ||
          user.sell_cities,
      ),
      Boolean(user.profile_image_url),
      true,
    ];
    return complete.filter(Boolean).length;
  }, [user]);

  const completion = Math.round((completedSections / steps.length) * 100);

  const setValue = (key: keyof ProfileForm, value: string) => {
    setForm((current) => ({ ...current, [key]: value }));
    setMessage("");
  };

  const showMessage = (text: string, error = false) => {
    setMessage(text);
    setIsError(error);
  };

  const apiErrorMessage = (error: unknown): string => {
    const apiError = error as {
      message?: string;
      errors?: Record<string, string[]>;
    };
    const firstError = apiError.errors
      ? Object.values(apiError.errors).flat()[0]
      : "";
    return firstError || apiError.message || "Could not save this section.";
  };

  const savePayload = async (
    step: StepId,
    payload: ProfileUpdatePayload | FormData,
  ) => {
    setSavingStep(step);
    setMessage("");
    try {
      const response = await AuthAPI.updateProfile(payload);
      if (step === "image") {
        const freshImageUrl = resolveProfileImageUrl(
          response.user.profile_image_url || response.user.profile_image,
        );
        if (freshImageUrl) {
          setProfileImagePreview(
            `${freshImageUrl}${freshImageUrl.includes("?") ? "&" : "?"}v=${Date.now()}`,
          );
          setProfileImageBroken(false);
          setProfileImageFile(null);
        }
      }
      await refreshUser();
      showMessage(`${steps.find((item) => item.id === step)?.title} saved.`);
      if (activeIndex < steps.length - 1) {
        window.setTimeout(() => setActiveStep(steps[activeIndex + 1].id), 350);
      }
    } catch (error) {
      showMessage(apiErrorMessage(error), true);
    } finally {
      setSavingStep(null);
    }
  };

  const saveCurrentStep = async () => {
    if (activeStep === "personal") {
      const phone = form.phone.replace(/\D/g, "").slice(0, 10);
      if (!form.name.trim()) return showMessage("Full name is required.", true);
      if (phone.length !== 10)
        return showMessage("Enter a valid 10-digit phone number.", true);
      if (form.pincode && !/^\d{6}$/.test(form.pincode)) {
        return showMessage("Pincode must contain 6 digits.", true);
      }
      return savePayload("personal", {
        name: form.name.trim(),
        phone,
        city: form.city.trim(),
        state: form.state.trim(),
        pincode: form.pincode,
        address: form.address.trim(),
      });
    }

    if (activeStep === "company") {
      const companyName = (
        form.developer_name || form.company_name
      ).trim();
      if (!companyName)
        return showMessage(`${companyLabel} is required.`, true);
      return savePayload("company", {
        company_name: companyName,
        developer_name:
          user?.role === "developer_super_admin" ? companyName : undefined,
        company_size: form.company_size,
        rera_no: form.rera_no.trim(),
        gst_no: form.gst_no.trim().toUpperCase(),
      });
    }

    if (activeStep === "business") {
      return savePayload("business", {
        experience_level: form.experience_level,
        primary_market: form.primary_market
          .split(",")
          .map((item) => item.trim())
          .filter(Boolean),
        micro_markets: form.micro_markets.trim(),
        sell_cities: form.sell_cities.trim(),
        avg_leads_per_month: numberValue(form.avg_leads_per_month),
        avg_site_visits_per_month: numberValue(
          form.avg_site_visits_per_month,
        ),
        avg_closures_per_month: numberValue(form.avg_closures_per_month),
      });
    }

    if (activeStep === "image") {
      if (!profileImageFile) {
        return showMessage("Choose a profile image before saving.", true);
      }
      const payload = new FormData();
      payload.append("profile_image", profileImageFile);
      return savePayload("image", payload);
    }

    if (!isStrongPassword(password)) {
      return showMessage(PASSWORD_POLICY_ERROR, true);
    }
    if (password !== passwordConfirmation) {
      return showMessage("New password and confirmation must match.", true);
    }
    await savePayload("password", {
      password,
      password_confirmation: passwordConfirmation,
    });
    setPassword("");
    setPasswordConfirmation("");
  };

  const handleImage = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null;
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      showMessage("Profile image must be smaller than 2MB.", true);
      event.target.value = "";
      return;
    }
    if (profileImagePreview.startsWith("blob:")) {
      URL.revokeObjectURL(profileImagePreview);
    }
    setProfileImageFile(file);
    setProfileImagePreview(URL.createObjectURL(file));
    setProfileImageBroken(false);
    setMessage("");
  };

  if (isLoading || !isAuthenticated || !user) {
    return (
      <div className="page-loader">
        <div className="spinner spinner-lg" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-main">
      <Header variant="app" />

      <main style={{ paddingTop: "calc(var(--header-height) + 0.75rem)" }}>
        <section
          style={{
            background: "var(--gradient-header)",
            paddingTop: "0.75rem",
          }}
        >
          <div className="mx-auto flex w-full max-w-7xl flex-col gap-5 px-4 py-6 text-white sm:px-6 md:flex-row md:items-center md:justify-between md:gap-8 md:py-8 lg:px-8">
            <div>
              <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-blue-200">
                Account Settings
              </p>
              <h1 className="text-2xl font-bold md:text-3xl">My Profile</h1>
              <p className="mt-1 hidden text-sm text-white/65 sm:block">
                Keep your contact, business and security details up to date.
              </p>
            </div>
            <div className="w-full rounded-2xl border border-white/10 bg-white/10 px-5 py-4 shadow-inner md:w-72">
              <div className="mb-2 flex items-center justify-between gap-4 text-sm text-white/75">
                <span>Profile completion</span>
                <strong className="text-lg text-white">{completion}%</strong>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-white/20">
                <span
                  className="block h-full rounded-full bg-gradient-to-r from-orange-400 to-orange-600 transition-all"
                  style={{ width: `${completion}%` }}
                />
              </div>
            </div>
          </div>
        </section>

        <section className="mx-auto grid w-full max-w-7xl grid-cols-1 items-start gap-5 px-4 py-6 sm:px-6 md:py-8 lg:grid-cols-[300px_minmax(0,1fr)] lg:gap-6 lg:px-8">
          <aside className="overflow-hidden rounded-3xl border border-white/70 bg-white/85 p-4 shadow-xl backdrop-blur-xl lg:sticky lg:top-[calc(var(--header-height)+1.25rem)]">
            <div className="flex items-center gap-4 border-b border-slate-200 px-1 pb-4">
              <div className="relative grid h-16 w-16 shrink-0 place-items-center overflow-hidden rounded-full border-[3px] border-orange-500 bg-blue-50 text-xl font-extrabold text-blue-950 shadow-lg">
                {profileImagePreview && !profileImageBroken ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    className="absolute inset-0 h-full w-full rounded-full object-cover"
                    src={profileImagePreview}
                    alt={form.name}
                    onError={() => setProfileImageBroken(true)}
                  />
                ) : (
                  <span>{initials(form.name)}</span>
                )}
              </div>
              <div className="min-w-0">
                <strong className="block truncate text-base text-slate-900">
                  {form.name || "Your profile"}
                </strong>
                <span className="block truncate text-xs text-slate-500">
                  {user.email}
                </span>
                <small className="mt-2 inline-block rounded-full bg-green-100 px-3 py-1 text-[10px] font-bold capitalize text-green-700">
                  {user.role.replace(/_/g, " ")}
                </small>
              </div>
            </div>

            <nav
              className="mt-4 flex snap-x gap-2 overflow-x-auto pb-1 lg:grid lg:overflow-visible"
              aria-label="Profile sections"
            >
              {steps.map((step, index) => (
                <button
                  key={step.id}
                  type="button"
                  className={`flex min-w-[210px] snap-start items-center gap-3 rounded-2xl border p-3 text-left transition lg:min-w-0 ${
                    activeStep === step.id
                      ? "border-blue-950 bg-gradient-to-br from-blue-950 to-blue-800 text-white shadow-lg"
                      : "border-slate-200 bg-white/80 text-slate-900 hover:border-blue-300"
                  }`}
                  onClick={() => {
                    setActiveStep(step.id);
                    setMessage("");
                  }}
                >
                  <span
                    className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl text-xs font-black ${
                      activeStep === step.id
                        ? "bg-orange-500 text-white"
                        : "bg-blue-50 text-blue-900"
                    }`}
                  >
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <span className="min-w-0">
                    <strong className="block text-sm">{step.title}</strong>
                    <small
                      className={`block truncate text-xs ${
                        activeStep === step.id
                          ? "text-white/65"
                          : "text-slate-500"
                      }`}
                    >
                      {step.subtitle}
                    </small>
                  </span>
                </button>
              ))}
            </nav>

            {user.assigned_projects?.length ? (
              <div className="mt-4 hidden items-center justify-between rounded-xl bg-blue-50 px-4 py-3 text-xs text-blue-800 lg:flex">
                <span>Assigned projects</span>
                <strong className="text-base text-orange-600">
                  {user.assigned_projects.length}
                </strong>
              </div>
            ) : null}
          </aside>

          <div className="min-w-0 overflow-hidden rounded-3xl border border-white/70 bg-white/90 shadow-xl backdrop-blur-xl">
            <header className="flex items-start justify-between gap-4 border-b border-slate-200 bg-white/80 px-5 py-5 sm:px-7 sm:py-6">
              <div>
                <span className="text-xs font-black text-orange-600">
                  {String(activeIndex + 1).padStart(2, "0")}
                </span>
                <p className="mt-1 text-[10px] font-extrabold uppercase tracking-widest text-slate-500">
                  {currentStep.eyebrow}
                </p>
                <h2 className="text-xl font-bold text-slate-900 sm:text-2xl">
                  {currentStep.title}
                </h2>
                <span className="hidden text-sm text-slate-500 sm:block">
                  Update this section and save before moving to the next one.
                </span>
              </div>
              <div className="rounded-full bg-blue-50 px-3 py-1.5 text-xs font-bold text-blue-800">
                {activeIndex + 1} / {steps.length}
              </div>
            </header>

            <div className="min-h-[400px] bg-gradient-to-br from-slate-50/95 to-blue-50/80 p-5 sm:p-7">
              {activeStep === "personal" && (
                <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
                  <Field label="Full name" required>
                    <input
                      value={form.name}
                      onChange={(event) => setValue("name", event.target.value)}
                      placeholder="Enter your full name"
                    />
                  </Field>
                  <Field label="Email">
                    <input value={user.email} readOnly className="read-only" />
                  </Field>
                  <Field label="Phone number" required>
                    <input
                      inputMode="numeric"
                      value={form.phone}
                      onChange={(event) =>
                        setValue(
                          "phone",
                          event.target.value.replace(/\D/g, "").slice(0, 10),
                        )
                      }
                      placeholder="10-digit mobile number"
                    />
                  </Field>
                  <Field label="City">
                    <input
                      value={form.city}
                      onChange={(event) => setValue("city", event.target.value)}
                      placeholder="e.g. Pune"
                    />
                  </Field>
                  <Field label="State">
                    <input
                      value={form.state}
                      onChange={(event) => setValue("state", event.target.value)}
                      placeholder="e.g. Maharashtra"
                    />
                  </Field>
                  <Field label="Pincode">
                    <input
                      inputMode="numeric"
                      value={form.pincode}
                      onChange={(event) =>
                        setValue(
                          "pincode",
                          event.target.value.replace(/\D/g, "").slice(0, 6),
                        )
                      }
                      placeholder="6-digit pincode"
                    />
                  </Field>
                  <Field label="Residential address" wide>
                    <textarea
                      rows={4}
                      value={form.address}
                      onChange={(event) =>
                        setValue("address", event.target.value)
                      }
                      placeholder="Enter your complete address"
                    />
                  </Field>
                </div>
              )}

              {activeStep === "company" && (
                <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
                  <Field label={companyLabel} required wide>
                    <input
                      value={
                        user.role === "developer_super_admin"
                          ? form.developer_name
                          : form.company_name
                      }
                      onChange={(event) =>
                        setValue(
                          user.role === "developer_super_admin"
                            ? "developer_name"
                            : "company_name",
                          event.target.value,
                        )
                      }
                      placeholder="Enter registered company name"
                    />
                  </Field>
                  <Field label="Company size">
                    <select
                      value={form.company_size}
                      onChange={(event) =>
                        setValue("company_size", event.target.value)
                      }
                    >
                      <option value="">Select company size</option>
                      {companySizeOptions.map(([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="RERA number">
                    <input
                      value={form.rera_no}
                      onChange={(event) =>
                        setValue("rera_no", event.target.value.toUpperCase())
                      }
                      placeholder="RERA registration number"
                    />
                  </Field>
                  <Field label="GST number" wide>
                    <input
                      value={form.gst_no}
                      onChange={(event) =>
                        setValue("gst_no", event.target.value.toUpperCase())
                      }
                      placeholder="GST identification number"
                    />
                  </Field>
                </div>
              )}

              {activeStep === "business" && (
                <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
                  <Field label="Experience">
                    <select
                      value={form.experience_level}
                      onChange={(event) =>
                        setValue("experience_level", event.target.value)
                      }
                    >
                      {experienceOptions.map(([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Primary markets">
                    <input
                      value={form.primary_market}
                      onChange={(event) =>
                        setValue("primary_market", event.target.value)
                      }
                      placeholder="Residential, Commercial"
                    />
                    <small>Separate multiple markets with commas.</small>
                  </Field>
                  <Field label="Micro markets">
                    <input
                      value={form.micro_markets}
                      onChange={(event) =>
                        setValue("micro_markets", event.target.value)
                      }
                      placeholder="Baner, Hinjewadi, Wakad"
                    />
                  </Field>
                  <Field label="Cities you sell in">
                    <input
                      value={form.sell_cities}
                      onChange={(event) =>
                        setValue("sell_cities", event.target.value)
                      }
                      placeholder="Pune, Mumbai"
                    />
                  </Field>
                  <Field label="Monthly leads">
                    <input
                      type="number"
                      min="0"
                      value={form.avg_leads_per_month}
                      onChange={(event) =>
                        setValue("avg_leads_per_month", event.target.value)
                      }
                      placeholder="0"
                    />
                  </Field>
                  <Field label="Monthly site visits">
                    <input
                      type="number"
                      min="0"
                      value={form.avg_site_visits_per_month}
                      onChange={(event) =>
                        setValue(
                          "avg_site_visits_per_month",
                          event.target.value,
                        )
                      }
                      placeholder="0"
                    />
                  </Field>
                  <Field label="Monthly closures" wide>
                    <input
                      type="number"
                      min="0"
                      value={form.avg_closures_per_month}
                      onChange={(event) =>
                        setValue("avg_closures_per_month", event.target.value)
                      }
                      placeholder="0"
                    />
                  </Field>
                </div>
              )}

              {activeStep === "image" && (
                <div className="mx-auto grid max-w-3xl grid-cols-1 items-center gap-8 py-2 text-center sm:grid-cols-[180px_1fr] sm:text-left">
                  <div className="relative mx-auto grid aspect-square h-36 w-36 shrink-0 place-items-center overflow-hidden rounded-full border-[5px] border-white bg-gradient-to-br from-blue-100 to-slate-50 text-4xl font-black text-blue-950 shadow-xl ring-4 ring-orange-500 sm:h-44 sm:w-44">
                    {profileImagePreview && !profileImageBroken ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        className="absolute inset-0 h-full w-full rounded-full object-cover"
                        src={profileImagePreview}
                        alt="Profile preview"
                        onError={() => setProfileImageBroken(true)}
                      />
                    ) : (
                      <span>{initials(form.name)}</span>
                    )}
                    <i
                      className={`absolute bottom-2 right-2 h-6 w-6 rounded-full border-4 border-white ${
                        user.is_active ? "bg-green-500" : "bg-red-500"
                      }`}
                    />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-slate-900">
                      Choose a clear profile photo
                    </h3>
                    <p className="mb-5 mt-1 text-sm text-slate-500">
                      This image appears in your account menu and helps your
                      team recognise you.
                    </p>
                    <label className="flex min-h-32 cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed border-blue-300 bg-white/65 p-5 text-center transition hover:border-orange-500 hover:bg-orange-50">
                      <input
                        className="hidden"
                        type="file"
                        accept="image/png,image/jpeg,image/jpg,image/webp"
                        onChange={handleImage}
                      />
                      <span className="mb-2 grid h-9 w-9 place-items-center rounded-full bg-orange-100 text-xl text-orange-600">
                        +
                      </span>
                      <strong className="max-w-full truncate text-sm text-blue-950">
                        {profileImageFile
                          ? profileImageFile.name
                          : "Select profile image"}
                      </strong>
                      <small className="mt-1 text-xs text-slate-500">
                        JPG, PNG or WEBP, maximum 2MB
                      </small>
                    </label>
                    <div className="mt-4 flex items-center justify-between rounded-xl bg-white/65 px-4 py-3 text-xs text-slate-500">
                      <span>Account status</span>
                      <strong
                        className={
                          user.is_active ? "text-green-600" : "text-red-600"
                        }
                      >
                        {user.is_active ? "Active" : "Inactive"}
                      </strong>
                    </div>
                  </div>
                </div>
              )}

              {activeStep === "password" && (
                <div className="max-w-4xl">
                  <div className="mb-6 rounded-xl border-l-4 border-orange-500 bg-orange-50 px-4 py-3">
                    <span className="text-xs font-black uppercase text-orange-700">
                      Security tip
                    </span>
                    <p className="mt-1 text-sm text-orange-900/75">
                      Use a password you do not use anywhere else. Updating it
                      regularly keeps your account safer.
                    </p>
                  </div>
                  <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
                    <Field label="New password" required>
                      <input
                        type={showPassword ? "text" : "password"}
                        value={password}
                        onChange={(event) => setPassword(event.target.value)}
                        placeholder="Enter new password"
                      />
                    </Field>
                    <Field label="Confirm password" required>
                      <input
                        type={showPassword ? "text" : "password"}
                        value={passwordConfirmation}
                        onChange={(event) =>
                          setPasswordConfirmation(event.target.value)
                        }
                        placeholder="Re-enter new password"
                      />
                    </Field>
                  </div>
                  <label className="mt-4 flex cursor-pointer items-center gap-2 text-sm text-slate-600">
                    <input
                      className="h-4 w-4 accent-blue-700"
                      type="checkbox"
                      checked={showPassword}
                      onChange={(event) =>
                        setShowPassword(event.target.checked)
                      }
                    />
                    Show password
                  </label>
                  <div className="mt-5 grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {[
                      "At least 8 characters",
                      "One uppercase letter",
                      "One number",
                      "One special character",
                    ].map((rule) => (
                      <span
                        key={rule}
                        className="rounded-lg bg-white/70 px-3 py-2 text-xs text-slate-500"
                      >
                        <b className="mr-2 text-green-600">✓</b>
                        {rule}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {message && (
                <div
                  className={`alert mt-5 ${
                    isError ? "alert-danger" : "alert-success"
                  }`}
                >
                  {message}
                </div>
              )}
            </div>

            <footer className="flex flex-col-reverse gap-3 border-t border-slate-200 bg-white/85 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-7">
              <button
                type="button"
                className="btn btn-ghost w-full sm:w-auto"
                disabled={activeIndex === 0 || Boolean(savingStep)}
                onClick={() => setActiveStep(steps[activeIndex - 1].id)}
              >
                Previous
              </button>
              <div className="grid grid-cols-1 gap-2 sm:flex">
                <button
                  type="button"
                  className="btn btn-ghost hidden sm:inline-flex"
                  onClick={() => router.push("/home")}
                >
                  Back to home
                </button>
                <button
                  type="button"
                  className="btn btn-gold w-full sm:min-w-40 sm:w-auto"
                  disabled={Boolean(savingStep)}
                  onClick={saveCurrentStep}
                >
                  {savingStep === activeStep
                    ? "Saving..."
                    : activeIndex === steps.length - 1
                      ? "Update Password"
                      : "Save & Continue"}
                </button>
              </div>
            </footer>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
}

function Field({
  label,
  required = false,
  wide = false,
  children,
}: {
  label: string;
  required?: boolean;
  wide?: boolean;
  children: React.ReactNode;
}) {
  const fieldChildren = React.Children.map(children, (child) => {
    if (!React.isValidElement<{ className?: string }>(child)) return child;

    if (["input", "select", "textarea"].includes(String(child.type))) {
      return React.cloneElement(child, {
        className: `input-field ${child.props.className ?? ""}`.trim(),
      });
    }

    if (child.type === "small") {
      return React.cloneElement(child, {
        className: `mt-1 block text-xs text-slate-500 ${
          child.props.className ?? ""
        }`.trim(),
      });
    }

    return child;
  });

  return (
    <label
      className={`min-w-0 ${
        wide ? "sm:col-span-2" : ""
      }`}
    >
      <span className="label">
        {label}
        {required ? " *" : ""}
      </span>
      <div>{fieldChildren}</div>
    </label>
  );
}
