"use client";

import React, { useEffect, useMemo, useState } from "react";
import AddCustomerModal from "@/components/AddCustomerModal";
import { ApiProject, mediaUrl, normalize, toCardPrice } from "@/lib/conectr";
import {
  Customer,
  CustomerAPI,
  CustomerProjectLinkAPI,
  LinkedProjectCard,
} from "@/lib/api";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  allProjects: ApiProject[];
  initialProject?: ApiProject | null;
  onLinked?: (message: string) => void;
}

function customerDisplayName(customer: Customer): string {
  return customer.name?.trim() || customer.nickname?.trim() || "Customer";
}

function mapProjectCard(project: ApiProject): LinkedProjectCard {
  return {
    id: project.id,
    title: normalize(project.title) || "Untitled Project",
    developer: normalize(project.developer) || "",
    location: normalize(project.location) || "",
    price: toCardPrice(project),
    image_url:
      mediaUrl(project.background_image_mobile) ||
      mediaUrl(project.background_image_desktop) ||
      mediaUrl(project.main_logo) ||
      "",
  };
}

export default function ProjectCustomerLinkModal({
  isOpen,
  onClose,
  allProjects,
  initialProject,
  onLinked,
}: Props) {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [customersLoading, setCustomersLoading] = useState(false);
  const [selectedCustomerId, setSelectedCustomerId] = useState<number | null>(
    null,
  );
  const [selectedProjectIds, setSelectedProjectIds] = useState<number[]>([]);
  const [showAddCustomer, setShowAddCustomer] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");

  const todayDate = useMemo(() => new Date().toISOString().slice(0, 10), []);

  useEffect(() => {
    if (!isOpen) return;

    let active = true;
    setCustomersLoading(true);
    setError("");

    CustomerAPI.list()
      .then((res) => {
        if (!active) return;
        setCustomers(res.data || []);
      })
      .catch((e: unknown) => {
        if (!active) return;
        setError(
          (e as { message?: string }).message || "Failed to load customers.",
        );
      })
      .finally(() => {
        if (active) setCustomersLoading(false);
      });

    return () => {
      active = false;
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    if (initialProject?.id) {
      setSelectedProjectIds([initialProject.id]);
    } else {
      setSelectedProjectIds([]);
    }
  }, [isOpen, initialProject, todayDate]);

  const selectedCustomer = useMemo(
    () => customers.find((c) => c.id === selectedCustomerId) || null,
    [customers, selectedCustomerId],
  );

  const selectedProjects = useMemo(
    () =>
      allProjects.filter((project) => selectedProjectIds.includes(project.id)),
    [allProjects, selectedProjectIds],
  );

  const toggleProject = (projectId: number) => {
    setSelectedProjectIds((prev) =>
      prev.includes(projectId)
        ? prev.filter((id) => id !== projectId)
        : [...prev, projectId],
    );
  };

  const handleCustomerAdded = (customer: Customer) => {
    setCustomers((prev) => [customer, ...prev]);
    setSelectedCustomerId(customer.id);
    setShowAddCustomer(false);
  };

  const handleAddToCart = async () => {
    setError("");

    if (!selectedCustomerId) {
      setError("Please select a customer first.");
      return;
    }

    setSending(true);
    try {
      const payload: LinkedProjectCard[] = selectedProjects.map((project) => ({
        ...mapProjectCard(project),
        meeting_date: todayDate,
      }));
      await CustomerProjectLinkAPI.create({
        customer_id: selectedCustomerId,
        selected_projects: payload,
      });

      onLinked?.("Projects added to cart successfully.");
      onClose();
    } catch (e: unknown) {
      setError(
        (e as { message?: string }).message ||
          "Failed to add projects to cart.",
      );
    } finally {
      setSending(false);
    }
  };

  if (!isOpen) return null;

  return (
    <>
      <div className="modal-overlay">
        <div
          className="modal-box"
          style={{
            maxWidth: "72rem",
            width: "min(72rem, calc(100% - 1.2rem))",
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="modal-header">
            <div>
              <p className="modal-title">Add Projects To Customer Cart</p>
              <p className="modal-subtitle">
                Select customer and add multiple projects to cart
              </p>
            </div>
            <button className="modal-close" onClick={onClose}>
              ×
            </button>
          </div>

          <div className="modal-body" style={{ paddingTop: "0.8rem" }}>
            {error && <div className="alert alert-danger mb-3">{error}</div>}

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
              <div>
                <label className="label">Select Customer</label>
                <div className="flex gap-2">
                  <select
                    className="input-field"
                    title="Select customer"
                    aria-label="Select customer"
                    value={selectedCustomerId ?? ""}
                    onChange={(e) =>
                      setSelectedCustomerId(
                        e.target.value ? Number(e.target.value) : null,
                      )
                    }
                    disabled={customersLoading}
                  >
                    <option value="">Choose customer</option>
                    {customers.map((customer) => {
                      return (
                        <option key={customer.id} value={customer.id}>
                          {customer.name || customer.nickname
                            ? `${customer.name || customer.nickname} · ${customer.secret_code}`
                            : customer.secret_code}
                        </option>
                      );
                    })}
                  </select>
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={() => setShowAddCustomer(true)}
                    style={{ whiteSpace: "nowrap" }}
                  >
                    + Add Customer
                  </button>
                </div>
              </div>

              <div
                className="card p-3"
                style={{ borderRadius: "var(--radius-lg)" }}
              >
                <p
                  className="text-xs font-bold"
                  style={{ color: "var(--navy-700)" }}
                >
                  Customer Card
                </p>
                {selectedCustomer ? (
                  <div
                    className="mt-2 text-sm"
                    style={{ color: "var(--color-text-secondary)" }}
                  >
                    <p
                      className="font-bold"
                      style={{ color: "var(--navy-900)" }}
                    >
                      {customerDisplayName(selectedCustomer)}
                    </p>
                    <p>Name: {selectedCustomer.name || selectedCustomer.nickname}</p>
                    <p>Code: {selectedCustomer.secret_code}</p>
                    <p>Phone: {selectedCustomer.phone || "-"}</p>
                  </div>
                ) : (
                  <p
                    className="text-xs mt-2"
                    style={{ color: "var(--color-text-hint)" }}
                  >
                    Select customer to preview card.
                  </p>
                )}
              </div>
            </div>

            <label className="label">Select Projects (Multiple)</label>
            <div
              className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2"
              style={{ maxHeight: "220px", overflowY: "auto" }}
            >
              {allProjects.map((project) => {
                const checked = selectedProjectIds.includes(project.id);
                return (
                  <label
                    key={project.id}
                    className="card p-2.5 flex items-start gap-2 cursor-pointer"
                    style={{
                      borderRadius: "var(--radius-md)",
                      border: checked
                        ? "1.5px solid var(--orange-500)"
                        : "1px solid var(--slate-200)",
                      background: checked ? "var(--orange-50)" : "#fff",
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleProject(project.id)}
                      style={{ marginTop: 4 }}
                    />
                    <span
                      className="text-sm"
                      style={{ color: "var(--color-text-primary)" }}
                    >
                      {normalize(project.title) || "Untitled Project"}
                    </span>
                  </label>
                );
              })}
            </div>

            <div
              className="mt-4"
              style={{
                borderTop: "1px solid var(--slate-200)",
                paddingTop: "0.8rem",
              }}
            >
              <p
                className="text-xs font-bold mb-2"
                style={{ color: "var(--navy-700)" }}
              >
                Selected Project Cards ({selectedProjects.length})
              </p>
              <div
                className="grid grid-cols-1 md:grid-cols-2 gap-3"
                style={{ maxHeight: "280px", overflowY: "auto" }}
              >
                {selectedProjects.map((project) => {
                  const card = mapProjectCard(project);
                  return (
                    <div
                      key={project.id}
                      className="card p-2.5"
                      style={{ borderRadius: "var(--radius-md)" }}
                    >
                      {card.image_url ? (
                        <img
                          src={card.image_url}
                          alt={card.title}
                          style={{
                            width: "100%",
                            height: "100px",
                            objectFit: "cover",
                            borderRadius: "10px",
                          }}
                        />
                      ) : null}
                      <p
                        className="font-bold mt-2 text-sm"
                        style={{ color: "var(--navy-900)" }}
                      >
                        {card.title}
                      </p>
                      <p
                        className="text-xs"
                        style={{ color: "var(--color-text-muted)" }}
                      >
                        {card.developer || "-"}
                      </p>
                      <p
                        className="text-xs"
                        style={{ color: "var(--color-text-hint)" }}
                      >
                        {card.location || "-"}
                      </p>
                      <p
                        className="text-sm font-semibold mt-1"
                        style={{ color: "var(--orange-600)" }}
                      >
                        {card.price || "-"}
                      </p>
                    </div>
                  );
                })}
                {!selectedProjects.length && (
                  <div
                    className="card p-3 text-sm"
                    style={{ color: "var(--color-text-hint)" }}
                  >
                    No project selected yet.
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="modal-footer">
            <button className="btn btn-ghost" onClick={onClose}>
              Cancel
            </button>
            <button
              className="btn btn-gold"
              onClick={handleAddToCart}
              disabled={sending}
            >
              {sending ? "Adding..." : "Add To Cart"}
            </button>
          </div>
        </div>
      </div>

      {showAddCustomer && (
        <AddCustomerModal
          onClose={() => setShowAddCustomer(false)}
          onAdded={handleCustomerAdded}
        />
      )}
    </>
  );
}
