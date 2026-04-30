"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { useAuth } from "@/context/AuthContext";
import { AuthAPI } from "@/lib/api";
import { isStrongPassword, PASSWORD_POLICY_ERROR } from "@/lib/passwordPolicy";

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
};

const companySizeOptions = [
  { label: "Individual", value: "individual" },
  { label: "1-2", value: "1-2" },
  { label: "5-10", value: "5-10" },
  { label: "10-20", value: "10-20" },
  { label: "20-50", value: "20-50" },
  { label: "50-100", value: "50-100" },
  { label: "100+", value: "100+" },
];

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
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
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
  }));

  useEffect(() => {
    if (!user) return;

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
    });
    setProfileImageFile(null);
    setProfileImagePreview(user.profile_image_url ?? "");
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

  useEffect(() => {
    if (!isLoading && isAuthenticated && user?.role === "user") {
      router.replace("/customer");
    }
  }, [isLoading, isAuthenticated, router, user?.role]);

  const setValue = <K extends keyof ProfileForm>(
    key: K,
    value: ProfileForm[K],
  ) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setMessage("");
  };

  const saveProfile = async () => {
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
              Profile Settings
            </h1>
            <p className="text-sm auth-text-muted mb-5">
              Profile & Password Settings
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
                        onClick={() => saveProfile()}
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

            {!roleProfileMode && (
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
                    onClick={() => saveProfile()}
                  >
                    {saving ? "Saving..." : "Save Profile"}
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
