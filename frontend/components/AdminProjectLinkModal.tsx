// components/AdminProjectLinkModal.tsx
"use client";

import React, { useState, useEffect, useMemo, useRef } from "react";
import { fetchAllProjects, ApiProject } from "@/lib/conectr";
import {
  ProjectPresentationLinkAPI,
  CreateProjectPresentationLinkPayload,
} from "@/lib/api";

function cleanName(value: string | null | undefined): string {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

function dedupeKey(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

interface FormData {
  developerName: string;
  projectName: string;
  presentationId: number | null;
  withDeveloperLink: string;
  withoutDeveloperLink: string;
  shortServerSlideLink: string;
}

const INITIAL: FormData = {
  developerName: "",
  projectName: "",
  presentationId: null,
  withDeveloperLink: "",
  withoutDeveloperLink: "",
  shortServerSlideLink: "",
};

type FormErrors = Partial<Record<keyof FormData, string>>;

export default function AdminProjectLinkModal({
  isOpen,
  onClose,
  onSuccess,
}: Props) {
  const [form, setForm] = useState<FormData>(INITIAL);
  const [errors, setErrors] = useState<FormErrors>({});
  const [projects, setProjects] = useState<ApiProject[]>([]);
  const [loadingProjects, setLoadingProjects] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [apiError, setApiError] = useState("");
  const [success, setSuccess] = useState(false);
  const fetchedRef = useRef(false);

  useEffect(() => {
    if (!isOpen || fetchedRef.current) return;
    fetchedRef.current = true;
    setLoadingProjects(true);
    fetchAllProjects()
      .then(({ projects: data }) => setProjects(data))
      .catch(() => setApiError("Failed to load projects. Please try again."))
      .finally(() => setLoadingProjects(false));
  }, [isOpen]);

  const developerNames = useMemo(() => {
    const seen = new Set<string>();
    const names: string[] = [];
    projects.forEach((p) => {
      const dev = cleanName(p.developer);
      if (!dev) return;
      const key = dedupeKey(dev);
      if (seen.has(key)) return;
      seen.add(key);
      names.push(dev);
    });
    return names.sort((a, b) => a.localeCompare(b));
  }, [projects]);

  const filteredProjects = useMemo(() => {
    if (!form.developerName) return [];
    const key = dedupeKey(form.developerName);
    const seen = new Set<string>();
    return projects.filter((p) => {
      if (dedupeKey(cleanName(p.developer)) !== key) return false;
      const titleKey = dedupeKey(cleanName(p.title));
      if (seen.has(titleKey)) return false;
      seen.add(titleKey);
      return true;
    });
  }, [projects, form.developerName]);

  const set = (k: keyof FormData, v: string) => {
    setForm((prev) => {
      const next = { ...prev, [k]: v };
      if (k === "developerName") { next.projectName = ""; next.presentationId = null; }
      return next;
    });
    setErrors((prev) => ({ ...prev, [k]: undefined }));
  };

  const setProject = (projectId: number, title: string) => {
    setForm((prev) => ({ ...prev, projectName: title, presentationId: projectId }));
    setErrors((prev) => ({ ...prev, projectName: undefined }));
  };

  const validate = (): boolean => {
    const e: FormErrors = {};
    if (!form.developerName.trim())
      e.developerName = "Developer name is required";
    if (!form.projectName.trim()) e.projectName = "Project name is required";
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setApiError("");
    if (!validate()) return;
    setSubmitting(true);
    try {
      const payload: CreateProjectPresentationLinkPayload = {
        developer_name: form.developerName,
        project_name: form.projectName,
        presentation_id: form.presentationId!,
        with_developer_link: form.withDeveloperLink,
        without_developer_link: form.withoutDeveloperLink,
        seven_slide_link: form.shortServerSlideLink,
      };
      await ProjectPresentationLinkAPI.create(payload);
      setSuccess(true);
      if (onSuccess) onSuccess();
    } catch (err: unknown) {
      const apiErr = err as { message?: string; errors?: Record<string, string[]> };
      if (apiErr?.errors) {
        const first = Object.values(apiErr.errors).flat()[0];
        setApiError(first || apiErr.message || "Validation failed.");
      } else {
        setApiError(apiErr?.message || "Submission failed. Please try again.");
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleClose = () => {
    setForm(INITIAL);
    setErrors({});
    setApiError("");
    setSuccess(false);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={handleClose}>
      <div
        className="modal-box"
        style={{ maxWidth: "34rem" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="modal-header">
          <div>
            <p className="modal-title">Add Project Link</p>
            <p className="modal-subtitle">
              Admin — add presentation links for a project
            </p>
          </div>
          <button type="button" className="modal-close" onClick={handleClose}>
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
        <div className="modal-body">
          {success ? (
            <div className="space-y-4">
              <div className="alert alert-success">
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
                    d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
                Project link saved successfully!
              </div>
              <div
                className="modal-footer"
                style={{ margin: "0 -1.4rem -1.25rem", padding: "1rem 1.4rem" }}
              >
                <button
                  type="button"
                  onClick={handleClose}
                  className="btn btn-primary flex-1"
                >
                  Done
                </button>
              </div>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4" noValidate>
              {apiError && <div className="alert alert-danger">{apiError}</div>}

              {/* Developer Name */}
              <div>
                <label className="label">
                  Developer Name{" "}
                  <span style={{ color: "var(--red-600)" }}>*</span>
                </label>
                {loadingProjects ? (
                  <div
                    className="input-field flex items-center gap-2"
                    style={{ color: "var(--color-text-muted)" }}
                  >
                    <span
                      className="spinner"
                      style={{
                        width: "0.9rem",
                        height: "0.9rem",
                        borderWidth: "2px",
                      }}
                    />
                    Loading developers…
                  </div>
                ) : (
                  <select
                    className="input-field"
                    value={form.developerName}
                    onChange={(e) => set("developerName", e.target.value)}
                  >
                    <option value="">Select developer…</option>
                    {developerNames.map((name) => (
                      <option key={name} value={name}>
                        {name}
                      </option>
                    ))}
                  </select>
                )}
                {errors.developerName && (
                  <p
                    className="text-xs mt-1"
                    style={{ color: "var(--red-600)" }}
                  >
                    {errors.developerName}
                  </p>
                )}
              </div>

              {/* Project Name */}
              <div>
                <label className="label">
                  Project Name{" "}
                  <span style={{ color: "var(--red-600)" }}>*</span>
                </label>
                <select
                  className="input-field"
                  value={form.presentationId ?? ""}
                  onChange={(e) => {
                    const id = Number(e.target.value);
                    const proj = filteredProjects.find((p) => p.id === id);
                    if (proj) setProject(proj.id, cleanName(proj.title));
                  }}
                  disabled={!form.developerName}
                >
                  <option value="">
                    {form.developerName
                      ? "Select project…"
                      : "Select developer first"}
                  </option>
                  {filteredProjects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {cleanName(p.title) || `Project #${p.id}`}
                    </option>
                  ))}
                </select>
                {errors.projectName && (
                  <p
                    className="text-xs mt-1"
                    style={{ color: "var(--red-600)" }}
                  >
                    {errors.projectName}
                  </p>
                )}
              </div>

              <hr className="section-divider" />

              {/* With Developer Link */}
              <div>
                <label className="label">
                  With Developer Link{" "}
                  <span style={{ color: "var(--red-600)" }}>*</span>
                </label>
                <input
                  type="url"
                  className="input-field"
                  value={form.withDeveloperLink}
                  onChange={(e) => set("withDeveloperLink", e.target.value)}
                  placeholder="https://…"
                />
                {errors.withDeveloperLink && (
                  <p
                    className="text-xs mt-1"
                    style={{ color: "var(--red-600)" }}
                  >
                    {errors.withDeveloperLink}
                  </p>
                )}
              </div>

              {/* Without Developer Link */}
              <div>
                <label className="label">
                  Without Developer Link{" "}
                  <span style={{ color: "var(--red-600)" }}>*</span>
                </label>
                <input
                  type="url"
                  className="input-field"
                  value={form.withoutDeveloperLink}
                  onChange={(e) => set("withoutDeveloperLink", e.target.value)}
                  placeholder="https://…"
                />
                {errors.withoutDeveloperLink && (
                  <p
                    className="text-xs mt-1"
                    style={{ color: "var(--red-600)" }}
                  >
                    {errors.withoutDeveloperLink}
                  </p>
                )}
              </div>

              {/* Short Server Slide Link */}
              <div>
                <label className="label">
                  Short Server Slide Link{" "}
                  <span style={{ color: "var(--red-600)" }}>*</span>
                </label>
                <input
                  type="url"
                  className="input-field"
                  value={form.shortServerSlideLink}
                  onChange={(e) => set("shortServerSlideLink", e.target.value)}
                  placeholder="https://…"
                />
                {errors.shortServerSlideLink && (
                  <p
                    className="text-xs mt-1"
                    style={{ color: "var(--red-600)" }}
                  >
                    {errors.shortServerSlideLink}
                  </p>
                )}
              </div>

              <div
                className="modal-footer"
                style={{ margin: "0 -1.4rem -1.25rem", padding: "1rem 1.4rem" }}
              >
                <button
                  type="button"
                  onClick={handleClose}
                  className="btn btn-ghost flex-1"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="btn btn-primary flex-1"
                >
                  {submitting ? (
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
                    "Submit"
                  )}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
