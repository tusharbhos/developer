"use client";

import React, { useEffect, useMemo, useState } from "react";
import {
  ApiUser,
  Customer,
  CustomerSessionLink,
  CustomerSessionLinkAPI,
} from "@/lib/api";
import { getPresentationIdForProject } from "@/lib/presentationIds";

function formatDateTime(value?: string) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("en-IN");
}

function makePresenterId(user?: ApiUser | null) {
  if (!user) return "";
  if (user.unique_key) return user.unique_key;
  return `SP-${String(user.id).padStart(3, "0")}`;
}

function sameNonEmptyLink(left?: string, right?: string) {
  const leftValue = (left || "").trim();
  return leftValue !== "" && leftValue === (right || "").trim();
}

function isSelfViewOnlyLink(row: CustomerSessionLink) {
  return (
    Boolean(row.self_view_url) &&
    (row.raw_response?.mode === "self_view" ||
      sameNonEmptyLink(row.self_view_url, row.presenter_link) ||
      sameNonEmptyLink(row.self_view_url, row.viewer_link))
  );
}

export default function CustomerSessionLinkModal({
  customer,
  user,
  links,
  loading,
  onClose,
  onCreated,
}: {
  customer: Customer | null;
  user: ApiUser | null;
  links: CustomerSessionLink[];
  loading: boolean;
  onClose: () => void;
  onCreated: (row: CustomerSessionLink) => void;
}) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [ok, setOk] = useState("");
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const projectOptions = useMemo(() => {
    if (!customer) return [];
    const set = new Set<string>();

    (customer.projects || []).forEach((p) => {
      const name = (p.project_name || "").trim();
      if (name) set.add(name);
    });

    return Array.from(set);
  }, [customer]);

  const [projectName, setProjectName] = useState("");
  const [presentationId, setPresentationId] = useState("");
  const [presenterName, setPresenterName] = useState("");
  const [presenterPlatformId, setPresenterPlatformId] = useState("");
  const [presenterEmail, setPresenterEmail] = useState("");
  const [viewerName, setViewerName] = useState("");
  const [viewerPlatformId, setViewerPlatformId] = useState("");
  const [viewerEmail, setViewerEmail] = useState("");
  const [viewerPhone, setViewerPhone] = useState("");

  useEffect(() => {
    if (!customer) return;

    const defaultProject = projectOptions[0] || "";
    setProjectName(defaultProject);
    setPresentationId(getPresentationIdForProject(defaultProject));

    setPresenterName(user?.name || "");
    setPresenterPlatformId(makePresenterId(user));
    setPresenterEmail(user?.email || "");

    setViewerName(customer.name || customer.nickname || "");
    setViewerPlatformId(customer.secret_code || "");
    setViewerEmail(customer.email || "");
    setViewerPhone(customer.phone || "");

    setError("");
    setOk("");
  }, [customer, user, projectOptions]);

  if (!customer) return null;

  const handleCreate = async () => {
    if (!presentationId.trim()) {
      setError(
        "Presentation ID is not configured for this project. Please select The Altius or Gagan Myra.",
      );
      return;
    }

    if (!/^PRS-[A-Za-z0-9-]{4,}$/i.test(presentationId.trim())) {
      setError("Please enter a valid Presentation ID (example: PRS-3AEC34B3).");
      return;
    }

    if (!presenterName.trim()) {
      setError("Presenter name is required.");
      return;
    }

    if (!viewerName.trim()) {
      setError("Viewer name is required.");
      return;
    }

    setSubmitting(true);
    setError("");
    setOk("");

    try {
      const res = await CustomerSessionLinkAPI.create({
        customer_id: customer.id,
        project_name: projectName || presentationId,
        presentation_id: presentationId.trim(),
        presenter_name: presenterName.trim(),
        presenter_email: presenterEmail.trim() || undefined,
        presenter_id: presenterPlatformId.trim() || undefined,
        viewer_name: viewerName.trim(),
        viewer_email: viewerEmail.trim() || undefined,
        viewer_phone: viewerPhone.trim() || undefined,
        viewer_id: viewerPlatformId.trim() || undefined,
      });

      onCreated(res.data);
      setOk("Session link created and saved for this customer.");
    } catch (e: unknown) {
      setError(
        (e as { message?: string }).message ||
          "Failed to create session link. Check Presentation ID and API key.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handleCopy = async (text: string, key: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(null), 1600);
    } catch {
      // Ignore clipboard failures quietly in modal action buttons.
    }
  };

  return (
    <div className="modal-overlay">
      <div
        className="modal-box"
        style={{ maxWidth: "60rem", width: "min(60rem, calc(100% - 1.2rem))" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <div>
            <p className="modal-title">Create Session Links</p>
            <p className="modal-subtitle">
              {customer.name || customer.nickname} ({customer.secret_code})
            </p>
          </div>
          <button className="modal-close" onClick={onClose}>
            ×
          </button>
        </div>

        <div className="modal-body">
          {error && <div className="alert alert-danger mb-3">{error}</div>}
          {ok && <div className="alert alert-success mb-3">{ok}</div>}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div
              className="card p-3"
              style={{ borderRadius: "var(--radius-lg)" }}
            >
              <p
                className="text-sm font-bold mb-2"
                style={{ color: "var(--navy-700)" }}
              >
                Session Details
              </p>
              <label className="label">Presentation / Project *</label>
              <select
                className="input-field"
                value={projectName}
                onChange={(e) => {
                  const selectedProject = e.target.value;
                  setProjectName(selectedProject);
                  setPresentationId(
                    getPresentationIdForProject(selectedProject),
                  );
                }}
              >
                <option value="">Select project from meetings</option>
                {projectOptions.map((project) => (
                  <option key={project} value={project}>
                    {project}
                    {getPresentationIdForProject(project)
                      ? ` - ${getPresentationIdForProject(project)}`
                      : ""}
                  </option>
                ))}
              </select>

              <label className="label mt-2">Presentation ID *</label>
              <input
                className="input-field"
                value={presentationId}
                readOnly
                placeholder="PRS-3AEC34B3"
              />
              
            </div>

            <div
              className="card p-3"
              style={{ borderRadius: "var(--radius-lg)" }}
            >
              <p
                className="text-sm font-bold mb-2"
                style={{ color: "var(--navy-700)" }}
              >
                Presenter (Sales Person)
              </p>
              <label className="label">Name *</label>
              <input
                className="input-field"
                value={presenterName}
                onChange={(e) => setPresenterName(e.target.value)}
              />

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-2">
                <div>
                  <label className="label">ID (from your platform)</label>
                  <input
                    className="input-field"
                    value={presenterPlatformId}
                    onChange={(e) => setPresenterPlatformId(e.target.value)}
                  />
                </div>
                <div>
                  <label className="label">Email</label>
                  <input
                    className="input-field"
                    type="email"
                    value={presenterEmail}
                    onChange={(e) => setPresenterEmail(e.target.value)}
                  />
                </div>
              </div>
            </div>

            <div
              className="card p-3 lg:col-span-2"
              style={{ borderRadius: "var(--radius-lg)" }}
            >
              <p
                className="text-sm font-bold mb-2"
                style={{ color: "var(--green-700)" }}
              >
                Viewer (Customer)
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div>
                  <label className="label">Name *</label>
                  <input
                    className="input-field"
                    value={viewerName}
                    onChange={(e) => setViewerName(e.target.value)}
                  />
                </div>
                <div>
                  <label className="label">ID (Customer ID)</label>
                  <input
                    className="input-field"
                    value={viewerPlatformId}
                    onChange={(e) => setViewerPlatformId(e.target.value)}
                  />
                </div>
                <div>
                  <label className="label">Email</label>
                  <input
                    className="input-field"
                    type="email"
                    value={viewerEmail}
                    onChange={(e) => setViewerEmail(e.target.value)}
                  />
                </div>
                <div>
                  <label className="label">Phone</label>
                  <input
                    className="input-field"
                    value={viewerPhone}
                    onChange={(e) => setViewerPhone(e.target.value)}
                  />
                </div>
              </div>
            </div>
          </div>

          <button
            className="btn btn-primary mt-4"
            style={{ width: "100%", background: "#020617", color: "#fff" }}
            disabled={submitting}
            onClick={handleCreate}
          >
            {submitting ? "Generating..." : "Generate Session Links"}
          </button>

          <div className="mt-5">
            <p
              className="text-sm font-bold mb-2"
              style={{ color: "var(--navy-700)" }}
            >
              Saved Links For This Customer
            </p>

            {loading ? (
              <div className="flex justify-center py-8">
                <div className="spinner" />
              </div>
            ) : links.length === 0 ? (
              <div className="alert alert-info">
                No session links created yet.
              </div>
            ) : (
              <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                {links.map((row) => {
                  const selfViewOnly = isSelfViewOnlyLink(row);
                  const visiblePresenterLink = selfViewOnly
                    ? ""
                    : row.presenter_link;
                  const visibleViewerLink = selfViewOnly
                    ? ""
                    : row.viewer_link;
                  const visibleSelfViewLink =
                    row.self_view_url ||
                    (selfViewOnly ? row.presenter_link || row.viewer_link : "");

                  return (
                  <div
                    key={row.id}
                    className="card p-3"
                    style={{
                      borderRadius: "var(--radius-md)",
                      border: "1px solid #bbf7d0",
                    }}
                  >
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm">
                      <div>
                        <div style={{ color: "var(--color-text-muted)" }}>
                          Project
                        </div>
                        <div className="font-semibold">
                          {row.project_name || row.presentation_id}
                        </div>
                      </div>
                      <div>
                        <div style={{ color: "var(--color-text-muted)" }}>
                          Code
                        </div>
                        <div className="font-semibold">
                          {row.join_code || row.session_code || "-"}
                        </div>
                      </div>
                      <div>
                        <div style={{ color: "var(--color-text-muted)" }}>
                          Presenter Link
                        </div>
                        <div className="truncate">
                          {visiblePresenterLink || "-"}
                        </div>
                      </div>
                      <div>
                        <div style={{ color: "var(--color-text-muted)" }}>
                          Viewer Link
                        </div>
                        <div className="truncate">
                          {visibleViewerLink || "-"}
                        </div>
                      </div>
                      <div>
                        <div style={{ color: "var(--color-text-muted)" }}>
                          Self-View Link
                        </div>
                        <div className="truncate">
                          {visibleSelfViewLink || "-"}
                        </div>
                      </div>
                      <div>
                        <div style={{ color: "var(--color-text-muted)" }}>
                          Created
                        </div>
                        <div>{formatDateTime(row.created_at)}</div>
                      </div>
                      <div>
                        <div style={{ color: "var(--color-text-muted)" }}>
                          Expires
                        </div>
                        <div>{formatDateTime(row.expires_at)}</div>
                      </div>
                    </div>

                    <div className="flex gap-2 mt-2 flex-wrap">
                      {visiblePresenterLink && (
                        <button
                          className="btn btn-ghost"
                          onClick={() =>
                            handleCopy(visiblePresenterLink, `presenter-${row.id}`)
                          }
                        >
                          {copiedKey === `presenter-${row.id}`
                            ? "Copied"
                            : "Copy Presenter Link"}
                        </button>
                      )}
                      {visibleViewerLink && (
                        <button
                          className="btn btn-ghost"
                          onClick={() =>
                            handleCopy(visibleViewerLink, `viewer-${row.id}`)
                          }
                        >
                          {copiedKey === `viewer-${row.id}`
                            ? "Copied"
                            : "Copy Viewer Link"}
                        </button>
                      )}
                      {visibleSelfViewLink && (
                        <button
                          className="btn btn-ghost"
                          onClick={() =>
                            handleCopy(
                              visibleSelfViewLink,
                              `self-${row.id}`,
                            )
                          }
                        >
                          {copiedKey === `self-${row.id}`
                            ? "Copied"
                            : "Copy Self-View Link"}
                        </button>
                      )}
                      {visiblePresenterLink && (
                        <button
                          className="btn btn-gold"
                          onClick={() =>
                            window.open(visiblePresenterLink, "_blank")
                          }
                        >
                          Open Presenter
                        </button>
                      )}
                      {visibleViewerLink && (
                        <button
                          className="btn btn-gold"
                          onClick={() => window.open(visibleViewerLink, "_blank")}
                        >
                          Open Viewer
                        </button>
                      )}
                      {visibleSelfViewLink && (
                        <button
                          className="btn btn-gold"
                          onClick={() =>
                            window.open(visibleSelfViewLink, "_blank")
                          }
                        >
                          Open Self-View
                        </button>
                      )}
                    </div>
                  </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
