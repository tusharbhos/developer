// components/AddCustomerModal.tsx
"use client";

import React, { useState, useEffect } from "react";
import { CustomerAPI, Customer } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";

interface Props {
  onClose: () => void;
  onAdded: (customer: Customer) => void;
  zIndex?: number;
}

export default function AddCustomerModal({ onClose, onAdded, zIndex }: Props) {
  const { user } = useAuth();
  const [nickname, setNickname] = useState("");
  const [secretCode, setSecretCode] = useState("");
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const buildPrefixFromUser = (): string => {
    const fullName = user?.name?.trim() || "";
    const words = fullName.split(/\s+/).filter(Boolean);

    if (words.length >= 2) {
      const first = words[0].replace(/[^a-zA-Z0-9]/g, "").slice(0, 2);
      const second = words[1].replace(/[^a-zA-Z0-9]/g, "").slice(0, 2);
      const prefix = `${first}${second}`.toUpperCase();
      return prefix || "CP";
    }

    if (words.length === 1) {
      const prefix = words[0].replace(/[^a-zA-Z0-9]/g, "").slice(0, 2);
      return (prefix || "CP").toUpperCase();
    }

    return "CP";
  };

  const applyPrefixToCode = (rawCode: string, prefix: string): string => {
    const parts = rawCode.split("-");
    if (parts.length > 1) {
      return `${prefix}-${parts.slice(1).join("-")}`;
    }
    return `${prefix}-${rawCode}`;
  };

  useEffect(() => {
    generateCode();
  }, []);

  const generateCode = async () => {
    setGenerating(true);
    setError("");
    const prefix = buildPrefixFromUser();
    try {
      const res = await CustomerAPI.generateCode();
      setSecretCode(applyPrefixToCode(res.secret_code, prefix));
    } catch {
      const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
      const code = Array.from(
        { length: 8 },
        () => chars[Math.floor(Math.random() * chars.length)],
      ).join("");
      setSecretCode(`${prefix}-${code}`);
    } finally {
      setGenerating(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSaving(true);
    try {
      const payload: Partial<Customer> = { status: "active" };
      if (nickname.trim()) payload.nickname = nickname.trim();
      if (secretCode.trim()) payload.secret_code = secretCode.trim();

      const res = await CustomerAPI.create(payload);
      onAdded(res.data);
    } catch (e: unknown) {
      setError(
        (e as { message?: string }).message || "Failed to add customer.",
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-overlay" style={zIndex ? { zIndex } : undefined}>
      <div
        className="modal-box"
        style={{ maxWidth: "26rem" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="modal-header">
          <div>
            <p className="modal-title">Add Customer</p>
            <p className="modal-subtitle">Create a new customer entry</p>
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

        {/* Body */}
        <form onSubmit={handleSubmit} className="modal-body space-y-4">
          {/* Nickname */}
          <div>
            <label className="label">Nickname</label>
            <input
              type="text"
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              placeholder="e.g. Rahul Bhai, Party A"
              className="input-field"
              autoFocus
            />
            <p
              className="text-xs mt-1"
              style={{ color: "var(--color-text-hint)" }}
            >
              Internal alias — only visible to you
            </p>
          </div>

          {/* Secret Code */}
          <div>
            <label className="label">Secret Code (Auto-generated)</label>
            <div className="flex gap-2 items-stretch">
              <div
                className="flex-1 flex items-center px-3 rounded-lg font-mono font-bold text-sm tracking-widest"
                style={{
                  height: 42,
                  background: "var(--navy-50)",
                  border: "1.5px solid var(--navy-100)",
                  color: "var(--navy-700)",
                  borderRadius: "var(--radius-md)",
                }}
              >
                {generating ? (
                  <span
                    className="spinner mx-auto"
                    style={{ width: "1rem", height: "1rem" }}
                  />
                ) : (
                  secretCode || "—"
                )}
              </div>
              <button
                type="button"
                onClick={generateCode}
                disabled={generating}
                className="btn btn-primary px-3"
                title="Regenerate"
                style={{ borderRadius: "var(--radius-md)" }}
              >
                <svg
                  className="w-4 h-4"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                  />
                </svg>
              </button>
            </div>
          </div>

          {/* Info */}
          <div className="alert alert-info">
            <svg
              className="w-4 h-4 shrink-0 mt-0.5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            <span>
              Full details (name, phone, meeting) can be added later via Edit.
            </span>
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

        {/* Footer */}
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
            disabled={saving || generating}
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
              "Add Customer →"
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
