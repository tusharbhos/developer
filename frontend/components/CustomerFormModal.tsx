"use client";

import React, { useState, useEffect } from "react";
import { CustomerAPI, Customer, ApiUser } from "@/lib/api";

interface CustomerFormModalProps {
  customer: Customer | null;
  onClose: () => void;
  onSuccess: () => void;
  user: ApiUser;
}

export default function ScheduleMeetingModal({
  customer,
  onClose,
  onSuccess,
  user,
}: CustomerFormModalProps) {
  const isEdit = !!customer;

  const [formData, setFormData] = useState({
    nickname: "",
    name: "",
    email: "",
    phone: "",
    address: "",
    status: "active" as "active" | "inactive",
  });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (customer) {
      setFormData({
        nickname: customer.nickname || "",
        name: customer.name || "",
        email: customer.email || "",
        phone: customer.phone || "",
        address: customer.address || "",
        status: customer.is_active === 1 ? "active" : "inactive",
      });
    }
  }, [customer]);

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>,
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!formData.nickname.trim()) {
      setError("Please enter customer name/nickname");
      return;
    }

    if (!formData.email.trim()) {
      setError("Please enter email");
      return;
    }

    try {
      setLoading(true);

      const payload: Partial<Customer> = {
        nickname: formData.nickname,
        name: formData.name,
        email: formData.email,
        phone: formData.phone,
        address: formData.address,
        is_active: formData.status === "active" ? 1 : 0,
      };

      if (isEdit && customer) {
        await CustomerAPI.update(customer.id, payload);
      } else {
        await CustomerAPI.create(payload);
      }

      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err.message || "Failed to save customer");
      console.error("Error:", err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center overflow-y-auto"
      style={{
        padding: "1.25rem 1rem calc(env(safe-area-inset-bottom) + 3.5rem)",
      }}
    >
      {/* Overlay */}
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm"></div>

      {/* Modal */}
      <div
        className="relative bg-white rounded-2xl shadow-2xl max-w-lg w-full overflow-y-auto"
        style={{
          maxHeight: "calc(100dvh - env(safe-area-inset-bottom) - 5.25rem)",
        }}
      >
        {/* Header */}
        <div
          className="sticky top-0 flex items-center justify-between p-6 border-b"
          style={{
            background:
              "linear-gradient(135deg, var(--navy-900), var(--navy-800))",
            borderColor: "rgba(255,255,255,0.1)",
          }}
        >
          <h2 className="text-xl font-bold text-white">
            {isEdit ? "✏️ Edit Customer" : "➕ Add New Customer"}
          </h2>
          <button
            onClick={onClose}
            className="text-white hover:bg-white/20 rounded-lg p-2 transition"
          >
            ✕
          </button>
        </div>

        {/* Content */}
        <form
          onSubmit={handleSubmit}
          className="p-6 space-y-4"
          style={{
            paddingBottom: "calc(1.5rem + env(safe-area-inset-bottom))",
          }}
        >
          {/* Nickname */}
          <div>
            <label
              className="block text-sm font-semibold mb-2"
              style={{ color: "var(--navy-900)" }}
            >
              Customer Name / Nickname *
            </label>
            <input
              type="text"
              name="nickname"
              value={formData.nickname}
              onChange={handleChange}
              placeholder="e.g., John Doe, ABC Company"
              className="w-full px-4 py-2 rounded-lg border-2 transition focus:outline-none"
              style={{
                borderColor: error ? "var(--orange-600)" : "var(--navy-300)",
                background: "rgba(255,255,255,0.9)",
              }}
            />
          </div>

          {/* Full Name */}
          <div>
            <label
              className="block text-sm font-semibold mb-2"
              style={{ color: "var(--navy-900)" }}
            >
              Full Name
            </label>
            <input
              type="text"
              name="name"
              value={formData.name}
              onChange={handleChange}
              placeholder="Full name (optional)"
              className="w-full px-4 py-2 rounded-lg border-2"
              style={{
                borderColor: "var(--navy-300)",
                background: "rgba(255,255,255,0.9)",
              }}
            />
          </div>

          {/* Email */}
          <div>
            <label
              className="block text-sm font-semibold mb-2"
              style={{ color: "var(--navy-900)" }}
            >
              Email Address *
            </label>
            <input
              type="email"
              name="email"
              value={formData.email}
              onChange={handleChange}
              placeholder="customer@example.com"
              className="w-full px-4 py-2 rounded-lg border-2 transition focus:outline-none"
              style={{
                borderColor: error ? "var(--orange-600)" : "var(--navy-300)",
                background: "rgba(255,255,255,0.9)",
              }}
            />
          </div>

          {/* Phone */}
          <div>
            <label
              className="block text-sm font-semibold mb-2"
              style={{ color: "var(--navy-900)" }}
            >
              Phone Number
            </label>
            <input
              type="tel"
              name="phone"
              value={formData.phone}
              onChange={handleChange}
              placeholder="+91 9999999999"
              className="w-full px-4 py-2 rounded-lg border-2"
              style={{
                borderColor: "var(--navy-300)",
                background: "rgba(255,255,255,0.9)",
              }}
            />
          </div>

          {/* Address */}
          <div>
            <label
              className="block text-sm font-semibold mb-2"
              style={{ color: "var(--navy-900)" }}
            >
              Address
            </label>
            <input
              type="text"
              name="address"
              value={formData.address}
              onChange={handleChange}
              placeholder="City, State, Zip"
              className="w-full px-4 py-2 rounded-lg border-2"
              style={{
                borderColor: "var(--navy-300)",
                background: "rgba(255,255,255,0.9)",
              }}
            />
          </div>

          {/* Status */}
          <div>
            <label
              className="block text-sm font-semibold mb-2"
              style={{ color: "var(--navy-900)" }}
            >
              Status
            </label>
            <select
              name="status"
              value={formData.status}
              onChange={handleChange}
              className="w-full px-4 py-2 rounded-lg border-2"
              style={{
                borderColor: "var(--navy-300)",
                background: "rgba(255,255,255,0.9)",
              }}
            >
              <option value="active">✓ Active</option>
              <option value="inactive">⊘ Inactive</option>
            </select>
          </div>

          {/* Info Text */}
          <div
            className="p-3 rounded-lg text-xs"
            style={{
              background: "rgba(37, 88, 168, 0.1)",
              color: "var(--navy-700)",
            }}
          >
            💡 After creating this customer, you can link projects and schedule
            meetings from the customer details page.
          </div>

          {error && (
            <div
              className="p-3 rounded-lg text-sm"
              style={{
                background: "rgba(239, 68, 68, 0.1)",
                color: "var(--orange-600)",
                borderLeft: "4px solid var(--orange-600)",
              }}
            >
              {error}
            </div>
          )}

          {/* Buttons */}
          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-3 rounded-lg font-semibold transition"
              style={{
                background: "rgba(209, 213, 219, 0.3)",
                color: "var(--navy-900)",
              }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 px-4 py-3 rounded-lg font-semibold text-white transition disabled:opacity-50"
              style={{
                background:
                  "linear-gradient(135deg, var(--orange-600), var(--orange-500))",
              }}
            >
              {loading
                ? "Saving..."
                : isEdit
                  ? "✓ Update Customer"
                  : "➕ Add Customer"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
