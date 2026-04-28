// components/EditCustomerModal.tsx
"use client";

import React, { useState } from "react";
import { CustomerAPI, Customer } from "@/lib/api";

interface Props {
  customer: Customer;
  onClose: () => void;
  onUpdated: (customer: Customer) => void;
}

const STATUS_OPTS: { label: string; value: Customer["status"] }[] = [
  { label: "Active", value: "active" },
  { label: "Inactive", value: "inactive" },
  { label: "Booked", value: "Booked" },
];

const STATUS_COLORS: Record<
  string,
  { bg: string; border: string; text: string }
> = {
  active: { bg: "#dcfce7", border: "#16a34a", text: "#15803d" },
  inactive: { bg: "#f1f5f9", border: "#94a3b8", text: "#475569" },
  Booked: { bg: "#f3e8ff", border: "#9333ea", text: "#7e22ce" },
};

export default function EditCustomerModal({
  customer,
  onClose,
  onUpdated,
}: Props) {
  const [form, setForm] = useState({
    nickname: customer.nickname,
    name: customer.name ?? "",
    phone: customer.phone ?? "",
    email: customer.email ?? "",
    address: customer.address ?? "",
    notes: customer.notes ?? "",
    status: customer.status,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const set = (k: keyof typeof form, v: string) =>
    setForm((p) => ({ ...p, [k]: v }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!form.nickname.trim()) {
      setError("Nickname is required.");
      return;
    }
    setSaving(true);
    try {
      await CustomerAPI.update(customer.id, form);
      const fresh = await CustomerAPI.get(customer.id);
      onUpdated(fresh.data);
    } catch (e: unknown) {
      const err = e as { message?: string; errors?: Record<string, string[]> };
      if (err.errors) {
        const k = Object.keys(err.errors)[0];
        setError(err.errors[k]?.[0] ?? "Update failed.");
      } else {
        setError(err.message ?? "Update failed.");
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-overlay">
      <div
        className="modal-box"
        style={{ maxWidth: "36rem" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* ── Header ── */}
        <div className="modal-header">
          <div>
            <p className="modal-title">Edit Customer</p>
            <p className="modal-subtitle">
              Code:{" "}
              <span className="font-mono font-bold">
                {customer.secret_code}
              </span>
            </p>
          </div>
          <button className="modal-close" onClick={onClose}>
            <svg
              className="w-4 h-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2.5}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        {/* ── Body ── */}
        <form onSubmit={handleSubmit} className="modal-body space-y-4">
          {/* Nickname + Status */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">
                Nickname <span className="req">*</span>
              </label>
              <input
                type="text"
                value={form.nickname}
                onChange={(e) => set("nickname", e.target.value)}
                className="input-field"
                placeholder="Nickname"
              />
            </div>
            <div>
              <label className="label">Status</label>
              <div className="flex flex-wrap gap-1.5 mt-1">
                {STATUS_OPTS.map((opt) => {
                  const sc = STATUS_COLORS[opt.value];
                  const active = form.status === opt.value;
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => set("status", opt.value)}
                      className="px-2.5 py-1 rounded-full text-xs font-bold transition-all"
                      style={{
                        background: active ? sc.bg : "#f1f5f9",
                        color: active ? sc.text : "var(--color-text-muted)",
                        border: active
                          ? `1.5px solid ${sc.border}`
                          : "1.5px solid var(--color-border)",
                      }}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Name + Phone */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Full Name</label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => set("name", e.target.value)}
                className="input-field"
                placeholder="Customer full name"
              />
            </div>
            <div>
              <label className="label">Phone</label>
              <input
                type="tel"
                value={form.phone}
                onChange={(e) =>
                  set("phone", e.target.value.replace(/\D/g, "").slice(0, 10))
                }
                className="input-field"
                placeholder="10-digit number"
              />
            </div>
          </div>

          {/* Email */}
          <div>
            <label className="label">Email</label>
            <input
              type="email"
              value={form.email}
              onChange={(e) => set("email", e.target.value)}
              className="input-field"
              placeholder="customer@email.com"
            />
          </div>

          {/* Address */}
          <div>
            <label className="label">Address</label>
            <textarea
              value={form.address}
              onChange={(e) => set("address", e.target.value)}
              rows={2}
              className="input-field"
              placeholder="Customer address"
            />
          </div>

          {/* Notes */}
          <div>
            <label className="label">Notes</label>
            <textarea
              value={form.notes}
              onChange={(e) => set("notes", e.target.value)}
              rows={2}
              className="input-field"
              placeholder="Any notes about this customer…"
            />
          </div>
        </form>

        {error && (
          <div className="alert alert-danger mb-3 mx-4">
            <svg
              className="w-4 h-4 shrink-0"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            {error}
          </div>
        )}

        {/* ── Footer ── */}
        <div className="modal-footer">
          <button
            type="button"
            onClick={onClose}
            className="btn btn-ghost flex-1"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={saving}
            className="btn btn-primary flex-1"
          >
            {saving ? (
              <span className="flex items-center gap-2">
                <span
                  className="spinner"
                  style={{
                    width: "0.9rem",
                    height: "0.9rem",
                    borderWidth: "2px",
                  }}
                />
                Saving…
              </span>
            ) : (
              "Save Changes →"
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
