"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { useCart } from "@/context/CartContext";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import AddCustomerModal from "@/components/AddCustomerModal";
import {
  Customer,
  CustomerAPI,
  CustomerProjectLinkAPI,
  LinkedProjectCard,
} from "@/lib/api";
import {
  ApiProject,
  fetchAllProjects,
  getProjectShowcaseVideo,
  getProjectShowcaseVideos,
  mediaUrl,
  normalize,
  toCardPrice,
  toNumber,
  toStatusLabel,
} from "@/lib/conectr";

const STATUS_COLORS: Record<string, { bg: string; color: string }> = {
  "under construction": { bg: "rgba(249,115,22,0.12)", color: "#b47a00" },
  ready: { bg: "rgba(22,163,74,0.12)", color: "#15803d" },
  "ready to move": { bg: "rgba(22,163,74,0.12)", color: "#15803d" },
  default: { bg: "rgba(30,69,128,0.1)", color: "#1e4580" },
};

function statusStyle(label: string) {
  const key = label.toLowerCase();
  return STATUS_COLORS[key] ?? STATUS_COLORS.default;
}

function mapProjectCard(project: ApiProject): LinkedProjectCard {
  const units = project.units ?? [];
  const unitTypes = Array.from(
    new Set(units.map((u) => normalize(u.unit_type)).filter(Boolean)),
  );
  const areaMin = units.map((u) => toNumber(u.area_min)).filter((v) => v > 0);
  const areaMax = units.map((u) => toNumber(u.area_max)).filter((v) => v > 0);
  const areaText =
    areaMin.length || areaMax.length
      ? `${Math.min(...(areaMin.length ? areaMin : areaMax)).toLocaleString("en-IN")} – ${Math.max(...(areaMax.length ? areaMax : areaMin)).toLocaleString("en-IN")} sq.ft`
      : "-";
  const developmentStatusRaw = normalize(project.development_status);
  return {
    id: project.id,
    title: normalize(project.title) || "Untitled Project",
    developer: normalize(project.developer) || "",
    location: normalize(project.location) || "-",
    price: toCardPrice(project) || "-",
    image_url:
      mediaUrl(project.background_image_mobile) ||
      mediaUrl(project.background_image_desktop) ||
      mediaUrl(project.main_logo) ||
      "",
    showcase_url: getProjectShowcaseVideo(project) || undefined,
    showcase_urls: getProjectShowcaseVideos(project),
    unit_types: unitTypes.length ? unitTypes.join(" / ") : "-",
    area: areaText,
    possession: normalize(project.possession_date) || "-",
    status: developmentStatusRaw ? toStatusLabel(developmentStatusRaw) : "-",
    units_left:
      typeof project.available_units === "number"
        ? project.available_units
        : undefined,
  };
}

function CartProjectMedia({
  project,
  title,
  image,
}: {
  project: ApiProject;
  title: string;
  image: string | null;
}) {
  const showcaseVideos = useMemo(
    () => getProjectShowcaseVideos(project),
    [project],
  );
  const [activeVideoIndex, setActiveVideoIndex] = useState(0);

  const hasMultipleVideos = showcaseVideos.length > 1;
  const safeVideoIndex =
    activeVideoIndex < showcaseVideos.length ? activeVideoIndex : 0;
  const showcaseVideoUrl =
    showcaseVideos[safeVideoIndex] ?? getProjectShowcaseVideo(project);

  const goNextVideo = useCallback(() => {
    if (!showcaseVideos.length) return;
    setActiveVideoIndex((prev) => (prev + 1) % showcaseVideos.length);
  }, [showcaseVideos.length]);

  if (showcaseVideoUrl) {
    return (
      <div
        style={{
          height: "clamp(120px,22vw,152px)",
          overflow: "hidden",
          background: "#020617",
          position: "relative",
        }}
      >
        <video
          src={showcaseVideoUrl}
          autoPlay
          loop={!hasMultipleVideos}
          muted
          playsInline
          preload="auto"
          onEnded={hasMultipleVideos ? goNextVideo : undefined}
          style={{
            width: "100%",
            height: "100%",
            objectFit: "cover",
            display: "block",
          }}
        />
      </div>
    );
  }

  if (image) {
    return (
      <div
        style={{
          height: "clamp(120px,22vw,152px)",
          overflow: "hidden",
          background: "#f1f5f9",
          position: "relative",
        }}
      >
        <img
          src={image}
          alt={title}
          loading="lazy"
          style={{
            width: "100%",
            height: "100%",
            objectFit: "cover",
          }}
        />
      </div>
    );
  }

  return (
    <div
      style={{
        height: "clamp(120px,22vw,152px)",
        background:
          "linear-gradient(135deg,var(--navy-900) 0%,var(--navy-700) 100%)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        position: "relative",
      }}
    >
      <span className="text-white text-3xl">🏢</span>
    </div>
  );
}

export default function CartPage() {
  const router = useRouter();
  const { isAuthenticated, isLoading } = useAuth();
  const { cartItems, removeFromCart, addToCart, clearCart } = useCart();

  // All projects
  const [allProjects, setAllProjects] = useState<ApiProject[]>([]);
  const [projectsLoading, setProjectsLoading] = useState(true);

  // Derived cart IDs
  const cartProjectIds = useMemo(
    () => cartItems.map((item) => item.id),
    [cartItems],
  );

  const cartItemsById = useMemo(() => {
    return cartItems.reduce<Record<number, (typeof cartItems)[number]>>(
      (acc, item) => {
        acc[item.id] = item;
        return acc;
      },
      {},
    );
  }, [cartItems]);

  // Customer selection
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [customersLoading, setCustomersLoading] = useState(false);
  const [selectedCustomerId, setSelectedCustomerId] = useState<number | null>(
    null,
  );
  const [showAddCustomer, setShowAddCustomer] = useState(false);

  // Project search
  const [projectSearch, setProjectSearch] = useState("");

  // Sending state
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [generatedLink, setGeneratedLink] = useState("");
  const [showShareOptions, setShowShareOptions] = useState(false);
  const [generatedMessage, setGeneratedMessage] = useState("");
  const [generatedProjectCount, setGeneratedProjectCount] = useState(0);
  const [linkCopied, setLinkCopied] = useState(false);

  // Contact fields for sending
  const [recipientPhone, setRecipientPhone] = useState("");
  const [recipientEmail, setRecipientEmail] = useState("");

  const openExternalTab = useCallback((url: string) => {
    const link = document.createElement("a");
    link.href = url;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.style.display = "none";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }, []);

  const normalizePhoneForWhatsApp = useCallback((rawPhone: string) => {
    const digits = rawPhone.replace(/\D/g, "");
    if (!digits) return "";
    if (digits.length === 10) return `91${digits}`;
    if (digits.length === 11 && digits.startsWith("0")) {
      return `91${digits.slice(1)}`;
    }
    return digits;
  }, []);

  const openWhatsApp = useCallback(
    (phone: string, message: string) => {
      const whatsappUrl = `https://api.whatsapp.com/send?phone=${phone}&text=${encodeURIComponent(message)}`;
      const userAgent =
        typeof navigator !== "undefined" ? navigator.userAgent : "";
      const isAppleDevice = /iPad|iPhone|iPod|Macintosh/i.test(userAgent);

      if (isAppleDevice) {
        window.location.href = whatsappUrl;
        return;
      }

      openExternalTab(whatsappUrl);
    },
    [openExternalTab],
  );

  useEffect(() => {
    if (isLoading) return;
    if (!isAuthenticated) {
      router.replace("/");
    }
  }, [isLoading, isAuthenticated, router]);

  // Load all projects
  useEffect(() => {
    if (!isAuthenticated) return;

    let active = true;
    setProjectsLoading(true);

    fetchAllProjects()
      .then((res) => {
        if (!active) return;
        setAllProjects(res?.projects || []);
      })
      .catch((e) => {
        if (!active) return;
        console.error("Failed to load projects:", e);
      })
      .finally(() => {
        if (active) setProjectsLoading(false);
      });

    return () => {
      active = false;
    };
  }, [isAuthenticated]);

  // Load customers
  useEffect(() => {
    if (!isAuthenticated) return;

    let active = true;
    setCustomersLoading(true);

    CustomerAPI.list()
      .then((res) => {
        if (!active) return;
        setCustomers(res.data || []);
      })
      .catch((e) => {
        if (!active) return;
        console.error("Failed to load customers:", e);
      })
      .finally(() => {
        if (active) setCustomersLoading(false);
      });

    return () => {
      active = false;
    };
  }, [isAuthenticated]);

  // Filter projects by search
  const filteredProjects = useMemo(() => {
    if (!projectSearch.trim()) return allProjects;
    const query = projectSearch.toLowerCase();
    return allProjects.filter(
      (p) =>
        normalize(p.title)?.toLowerCase().includes(query) ||
        normalize(p.developer)?.toLowerCase().includes(query) ||
        normalize(p.location)?.toLowerCase().includes(query),
    );
  }, [allProjects, projectSearch]);

  // Cart projects
  const cartProjects = useMemo(
    () => allProjects.filter((p) => cartProjectIds.includes(p.id)),
    [allProjects, cartProjectIds],
  );

  const selectedCustomer = useMemo(
    () => customers.find((c) => c.id === selectedCustomerId) || null,
    [customers, selectedCustomerId],
  );

  const todayDate = useMemo(() => new Date().toISOString().slice(0, 10), []);

  const buildProjectMessage = useCallback(() => {
    return cartProjects
      .map((project, index) => {
        const title = normalize(project.title) || "*****";
        const developer = normalize(project.developer) || "*****";
        const header = `${index + 1}. *${title}* by ${developer}`;

        const units = project.units ?? [];
        const unitTypes = Array.from(
          new Set(units.map((u) => normalize(u.unit_type)).filter(Boolean)),
        );
        const areaMin = units
          .map((u) => toNumber(u.area_min))
          .filter((v) => v > 0);
        const areaMax = units
          .map((u) => toNumber(u.area_max))
          .filter((v) => v > 0);
        const areaText =
          areaMin.length || areaMax.length
            ? `${Math.min(...(areaMin.length ? areaMin : areaMax)).toLocaleString("en-IN")} – ${Math.max(...(areaMax.length ? areaMax : areaMin)).toLocaleString("en-IN")} sq.ft`
            : "-";
        const statusText =
          toStatusLabel(normalize(project.development_status)) || "-";
        const unitsLeftValue =
          typeof project.available_units === "number"
            ? String(project.available_units)
            : "-";

        const detailsOnly = [
          `   📍 ${normalize(project.location) || "-"}`,
          `   💰 ${toCardPrice(project)}`,
          `   🏠 Type: ${unitTypes.length ? unitTypes.join(" / ") : "-"}`,
          `   📐 Area: ${areaText}`,
          `   📅 Possession: ${normalize(project.possession_date) || "-"}`,
          `   🏗️ Units Left: ${unitsLeftValue}`,
          `   🚧 Development Status: ${statusText}`,
        ].join("\n");

        return [header, detailsOnly].join("\n");
      })
      .join("\n\n");
  }, [cartProjects]);

  const createCustomerLink = useCallback(async () => {
    if (!selectedCustomerId) {
      throw new Error("Please select a customer first.");
    }

    if (!cartProjects.length) {
      throw new Error("Please add at least one project to cart.");
    }

    const payload: LinkedProjectCard[] = cartProjects.map((project) => ({
      ...mapProjectCard(project),
      meeting_date: cartItemsById[project.id]?.meeting_date || todayDate,
    }));

    const result = await CustomerProjectLinkAPI.create({
      customer_id: selectedCustomerId,
      selected_projects: payload,
    });

    return CustomerProjectLinkAPI.publicUrl(result.data.public_token || "");
  }, [
    cartItemsById,
    cartProjects,
    selectedCustomerId,
    todayDate,
  ]);

  // Toggle project in cart
  const toggleCartProject = (projectId: number) => {
    if (cartProjectIds.includes(projectId)) {
      removeFromCart(projectId);
    } else {
      const project = allProjects.find((p) => p.id === projectId);
      if (project) {
        const title = normalize(project.title) || "Untitled Project";
        const image_url =
          mediaUrl(project.background_image_mobile) ||
          mediaUrl(project.background_image_desktop) ||
          mediaUrl(project.main_logo) ||
          "";
        addToCart({
          id: projectId,
          title,
          image_url,
        });
      }
    }
  };

  // Add customer
  const handleCustomerAdded = (customer: Customer) => {
    setCustomers((prev) => [customer, ...prev]);
    setSelectedCustomerId(customer.id);
    setShowAddCustomer(false);
  };

  // Create link first, then share actions
  const handleCreateLink = async () => {
    setError("");
    setSuccess("");

    if (!selectedCustomerId) {
      setError("Please select a customer first.");
      return;
    }

    if (!cartProjects.length) {
      setError("Please add at least one project to cart.");
      return;
    }

    setIsSending(true);
    try {
      const messageSnapshot = buildProjectMessage();
      const projectCountSnapshot = cartProjects.length;
      const publicUrl = await createCustomerLink();
      setGeneratedLink(publicUrl);
      setGeneratedMessage(messageSnapshot);
      setGeneratedProjectCount(projectCountSnapshot);
      setShowShareOptions(false);
      clearCart();
      setSuccess("Link created successfully.");
    } catch (e: unknown) {
      setError(
        (e as { message?: string }).message || "Failed to generate link.",
      );
    } finally {
      setIsSending(false);
    }
  };

  const handleCopyLink = async () => {
    if (!generatedLink) return;
    try {
      await navigator.clipboard.writeText(generatedLink);
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 1600);
      setError("");
      setSuccess("Link copied.");
    } catch {
      setError("Unable to copy link. Please copy manually.");
    }
  };

  const handleShareLink = async () => {
    if (!generatedLink) return;
    const message = generatedMessage || buildProjectMessage();
    const projectCount = generatedProjectCount || cartProjects.length;

    try {
      if (navigator.share) {
        await navigator.share({
          title: `Project options (${projectCount})`,
          text: message,
          url: generatedLink,
        });
        setSuccess("Share sheet opened.");
      } else {
        await navigator.clipboard.writeText(generatedLink);
        setSuccess("Share not supported. Link copied instead.");
      }
      setError("");
      setShowShareOptions(true);
    } catch {
      setShowShareOptions(true);
    }
  };

  const handleSendWhatsapp = () => {
    setError("");
    if (!generatedLink) {
      setError("Please create link first.");
      return;
    }
    if (!recipientPhone.trim()) {
      setError("Please enter a phone number for WhatsApp.");
      return;
    }

    const phone = normalizePhoneForWhatsApp(recipientPhone);
    if (!phone) {
      setError("Please enter a valid phone number.");
      return;
    }

    const message = `${generatedMessage || buildProjectMessage()}\n\n${generatedLink}`;
    openWhatsApp(phone, message);
    setSuccess("Opening WhatsApp...");
  };

  const handleSendEmail = () => {
    setError("");
    if (!generatedLink) {
      setError("Please create link first.");
      return;
    }
    if (!recipientEmail.trim()) {
      setError("Please enter an email address.");
      return;
    }

    const projectCount = generatedProjectCount || cartProjects.length;
    const emailSubject = `Project options (${projectCount})`;
    const emailBody = `${generatedMessage || buildProjectMessage()}\n\n${generatedLink}`;
    const mailUrl = `mailto:${recipientEmail}?subject=${encodeURIComponent(emailSubject)}&body=${encodeURIComponent(emailBody)}`;
    window.location.href = mailUrl;
    setSuccess("Opening email...");
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-main flex items-center justify-center">
        <div className="spinner spinner-lg" />
      </div>
    );
  }

  if (!isAuthenticated) return null;

  return (
    <div className="min-h-screen bg-main flex flex-col">
      <Header variant="app" />
      <main
        className="flex-1 p-6"
        style={{ paddingTop: "calc(var(--header-height) + 1.5rem)" }}
      >
        <div className="max-w-7xl mx-auto">
          {/* Header */}
          <div className="flex items-center justify-between mb-8">
            <div>
              <h1 className="text-4xl font-bold text-gray-900">My Cart</h1>
              <p className="text-gray-600 mt-2">
                {cartProjectIds.length} project
                {cartProjectIds.length !== 1 ? "s" : ""} selected
              </p>
            </div>
          </div>

          {/* Error/Success Messages */}
          {error && (
            <div className="mb-6 p-4 rounded-lg bg-red-50 border border-red-200 text-red-800">
              {error}
            </div>
          )}
          {success && (
            <div className="mb-6 p-4 rounded-lg bg-green-50 border border-green-200 text-green-800">
              {success}
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Left: Projects */}
            <div className="lg:col-span-2">
              {/* Search Projects */}
              <div className="mb-6">
                <input
                  type="text"
                  placeholder="Search projects by name, developer, or location..."
                  value={projectSearch}
                  onChange={(e) => setProjectSearch(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {/* Cart Items - Responsive Grid */}
              <div className="mb-12">
                <h2 className="text-xl font-bold text-gray-900 mb-4">
                  🛒 Your Selected Projects ({cartProjectIds.length})
                </h2>
                {cartProjectIds.length === 0 ? (
                  <div className="p-8 bg-linear-to-r from-blue-50 to-purple-50 rounded-xl border-2 border-dashed border-blue-200 text-center">
                    <p className="text-gray-700 font-semibold text-lg">
                      Your cart is empty 📭
                    </p>
                    <p className="text-gray-600 text-sm mt-2">
                      Add projects from the list below to get started!
                    </p>
                    <button
                      onClick={() => router.push("/projects")}
                      className="btn btn-primary mt-4"
                      style={{
                        padding: "0.7rem 1.1rem",
                        fontSize: "0.82rem",
                        whiteSpace: "nowrap",
                      }}
                    >
                      Add To Cart From Projects
                    </button>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
                    {cartProjects.map((project) => {
                      const title = normalize(project.title) || "Project";
                      const image =
                        mediaUrl(project.background_image_mobile) ||
                        mediaUrl(project.background_image_desktop) ||
                        mediaUrl(project.main_logo);
                      const units = project.units ?? [];
                      const unitTypes = Array.from(
                        new Set(
                          units
                            .map((u) => normalize(u.unit_type))
                            .filter(Boolean),
                        ),
                      );
                      const areaMin = units
                        .map((u) => toNumber(u.area_min))
                        .filter((v) => v > 0);
                      const areaMax = units
                        .map((u) => toNumber(u.area_max))
                        .filter((v) => v > 0);
                      const areaText =
                        areaMin.length || areaMax.length
                          ? `${Math.min(...(areaMin.length ? areaMin : areaMax)).toLocaleString("en-IN")} - ${Math.max(...(areaMax.length ? areaMax : areaMin)).toLocaleString("en-IN")} sq.ft`
                          : "—";
                      const typeText = unitTypes.length
                        ? unitTypes.join(" / ")
                        : "—";
                      const possession =
                        normalize(project.possession_date) || "—";
                      const status = toStatusLabel(
                        normalize(project.development_status),
                      );
                      const sc = statusStyle(status);

                      return (
                        <article
                          key={project.id}
                          className="card glass-card project-card-glow flex flex-col"
                          style={{
                            borderRadius: "var(--radius-xl)",
                            overflow: "hidden",
                            background: "rgba(255,255,255,0.2)",
                            border: "1px solid rgba(255,255,255,0.45)",
                            backdropFilter: "blur(20px)",
                            WebkitBackdropFilter: "blur(10px)",
                          }}
                        >
                          <CartProjectMedia
                            project={project}
                            title={title}
                            image={image}
                          />

                          <div
                            className="p-3.5 md:p-4 flex flex-col"
                            style={{ gap: "0.6rem" }}
                          >
                            <div>
                              <h3
                                className="font-bold leading-snug truncate"
                                style={{
                                  fontFamily: "var(--font-display)",
                                  color: "var(--navy-900)",
                                  fontSize: "clamp(0.82rem,2vw,0.9rem)",
                                }}
                              >
                                {normalize(project.title)}
                              </h3>
                              <p
                                className="text-xs truncate mt-0.5"
                                style={{ color: "var(--color-text-muted)" }}
                              >
                                {normalize(project.developer)}
                              </p>
                            </div>

                            <p
                              className="text-xs"
                              style={{ color: "var(--color-text-muted)" }}
                            >
                              📍 {normalize(project.location)}
                            </p>

                            <p
                              className="font-bold"
                              style={{
                                fontFamily: "var(--font-display)",
                                color: "var(--orange-600)",
                                fontSize: "clamp(0.9rem,2.5vw,1.05rem)",
                              }}
                            >
                              {toCardPrice(project)}
                            </p>

                            <div className="grid grid-cols-2 gap-1.5">
                              {[
                                { key: "type", label: "Type", val: typeText },
                                { key: "area", label: "Area", val: areaText },
                                {
                                  key: "possession",
                                  label: "Possession",
                                  val: possession,
                                },
                                {
                                  key: "units",
                                  label: "Units Left",
                                  val: `${toNumber(project.available_units) || 0}`,
                                },
                              ].map((info) => (
                                <div
                                  key={info.key}
                                  className="px-2 py-1.5 rounded-lg"
                                  style={{
                                    background: "var(--slate-50)",
                                    border: "1px solid var(--slate-100)",
                                  }}
                                >
                                  <p
                                    style={{
                                      fontSize: "9px",
                                      fontWeight: 600,
                                      textTransform: "uppercase",
                                      letterSpacing: "0.04em",
                                      color: "var(--color-text-hint)",
                                    }}
                                  >
                                    {info.label}
                                  </p>
                                  <p
                                    className="text-xs font-semibold truncate"
                                    style={{
                                      color: "var(--color-text-primary)",
                                    }}
                                  >
                                    {info.val}
                                  </p>
                                </div>
                              ))}
                            </div>

                            <div className="flex items-center justify-between mt-auto pt-1">
                              <span
                                className="text-xs font-bold px-2.5 py-1 rounded-full"
                                style={{ background: sc.bg, color: sc.color }}
                              >
                                {status}
                              </span>
                              <button
                                onClick={() => removeFromCart(project.id)}
                                className="btn btn-ghost"
                                style={{
                                  fontSize: "0.72rem",
                                  padding: "0.34rem 0.6rem",
                                  color: "#b91c1c",
                                  border: "1px solid rgba(185,28,28,0.2)",
                                  background: "rgba(254,226,226,0.7)",
                                }}
                              >
                                Remove
                              </button>
                            </div>
                          </div>
                        </article>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* Right: Summary & Send */}
            <div className="lg:col-span-1">
              <div className="bg-white rounded-lg border border-gray-200 p-6 sticky top-6">
                {/* Customer Selection */}
                <div className="mb-6">
                  <h3 className="text-lg font-bold text-gray-900 mb-3">
                    Customer
                  </h3>
                  {customersLoading ? (
                    <p className="text-sm text-gray-600">
                      Loading customers...
                    </p>
                  ) : (
                    <div>
                      <select
                        aria-label="Select customer"
                        value={selectedCustomerId || ""}
                        onChange={(e) =>
                          setSelectedCustomerId(
                            e.target.value ? Number(e.target.value) : null,
                          )
                        }
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                      >
                        <option value="">Select a customer...</option>
                        {customers.map((customer) => {
                          return (
                            <option key={customer.id} value={customer.id}>
                              {customer.nickname || customer.name
                                ? `${customer.nickname || customer.name} · ${customer.secret_code}`
                                : customer.secret_code}
                            </option>
                          );
                        })}
                      </select>
                      <button
                        onClick={() => setShowAddCustomer(true)}
                        className="btn btn-ghost w-full mt-2"
                        style={{
                          borderColor: "var(--navy-100)",
                          color: "var(--navy-700)",
                          background: "var(--navy-50)",
                          fontSize: "0.82rem",
                          padding: "0.55rem 0.75rem",
                        }}
                      >
                        + Add New Customer
                      </button>
                    </div>
                  )}
                </div>

                {/* Contact Fields */}
                <div className="mb-6 pb-6 border-b">
                  <h3 className="text-lg font-bold text-gray-900 mb-3">
                    Send Via
                  </h3>

                  <button
                    onClick={handleCreateLink}
                    disabled={isSending}
                    className="btn btn-primary w-full mt-1 disabled:opacity-50"
                    style={{ fontSize: "0.82rem", padding: "0.6rem 0.8rem" }}
                  >
                    {isSending ? "Creating..." : "Create Link"}
                  </button>

                  {generatedLink && (
                    <div className="mt-3">
                      <p className="text-[11px] text-gray-600 break-all mb-2">
                        {generatedLink}
                      </p>
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          onClick={handleCopyLink}
                          className="btn btn-ghost"
                          style={{
                            fontSize: "0.8rem",
                            padding: "0.5rem 0.65rem",
                            borderColor: "var(--slate-200)",
                            background: "var(--slate-50)",
                          }}
                        >
                          {linkCopied ? "Copied" : "Copy Link"}
                        </button>
                        <button
                          onClick={handleShareLink}
                          className="btn btn-gold"
                          style={{
                            fontSize: "0.8rem",
                            padding: "0.5rem 0.65rem",
                          }}
                        >
                          Share Link
                        </button>
                      </div>
                    </div>
                  )}

                  {showShareOptions && generatedLink && (
                    <div className="mt-4 grid grid-cols-1 gap-3">
                      <div
                        className="p-3 rounded-xl"
                        style={{
                          border: "1px solid var(--color-border)",
                          background: "var(--slate-50)",
                        }}
                      >
                        <label
                          className="block text-xs font-bold mb-2"
                          style={{ color: "var(--navy-900)" }}
                        >
                          WhatsApp Number
                        </label>
                        <input
                          type="tel"
                          placeholder="Enter phone number"
                          value={recipientPhone}
                          onChange={(e) => setRecipientPhone(e.target.value)}
                          className="input-field"
                        />
                        <button
                          onClick={handleSendWhatsapp}
                          className="btn btn-primary w-full mt-2"
                          style={{
                            fontSize: "0.8rem",
                            padding: "0.55rem 0.8rem",
                          }}
                        >
                          Send via WhatsApp
                        </button>
                      </div>

                      <div
                        className="p-3 rounded-xl"
                        style={{
                          border: "1px solid var(--color-border)",
                          background: "var(--slate-50)",
                        }}
                      >
                        <label
                          className="block text-xs font-bold mb-2"
                          style={{ color: "var(--navy-900)" }}
                        >
                          Email Address
                        </label>
                        <input
                          type="email"
                          placeholder="Enter email address"
                          value={recipientEmail}
                          onChange={(e) => setRecipientEmail(e.target.value)}
                          className="input-field"
                        />
                        <button
                          onClick={handleSendEmail}
                          className="btn btn-gold w-full mt-2"
                          style={{
                            fontSize: "0.8rem",
                            padding: "0.55rem 0.8rem",
                          }}
                        >
                          Send via Email
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>
      <Footer />

      {/* Add Customer Modal */}
      {showAddCustomer && (
        <AddCustomerModal
          onClose={() => setShowAddCustomer(false)}
          onAdded={handleCustomerAdded}
        />
      )}
    </div>
  );
}
