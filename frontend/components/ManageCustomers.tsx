"use client";

import React, { useEffect, useState } from "react";
import { Customer } from "@/lib/api";
import { exportToExcel } from "@/lib/excelExport";
import { formatDisplayDateTime } from "@/lib/dateTime";

interface ManageCustomersProps {
  customers: Customer[];
  loading: boolean;
  onRefresh: () => void;
  onAddCustomer: () => void;
  searchTerm: string;
  onSearchChange: (term: string) => void;
}

export default function ManageCustomers({
  customers,
  loading,
  onRefresh,
  onAddCustomer,
  searchTerm,
  onSearchChange,
}: ManageCustomersProps) {
  const [exporting, setExporting] = useState(false);
  const [sortBy, setSortBy] = useState<"name" | "date" | "status">("name");
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 8;

  const sortedCustomers = [...customers].sort((a, b) => {
    if (sortBy === "date") {
      return (
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );
    } else if (sortBy === "status") {
      return (b.is_active || 0) - (a.is_active || 0);
    }
    return (a.name || a.nickname || "").localeCompare(
      b.name || b.nickname || "",
    );
  });

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, sortBy, customers.length]);

  const handleExportExcel = async () => {
    try {
      setExporting(true);
      const data = customers.map((c) => ({
        Name: c.name || c.nickname || "N/A",
        "Secret Code": c.secret_code || "N/A",
        Email: c.email || "N/A",
        Phone: c.phone || "N/A",
        Address: c.address || "N/A",
        "Related Projects": (c.projects || [])
          .map((p) => p.project_name)
          .filter(Boolean)
          .join(", "),
        Status: c.is_active === 1 ? "Active" : "Inactive",
        "Meetings/Projects": c.projects?.length || 0,
        "Created Date": formatDisplayDateTime(c.created_at),
      }));

      exportToExcel(
        data,
        `Customers_${new Date().toISOString().split("T")[0]}`,
      );
    } catch (error) {
      console.error("Error exporting:", error);
      alert("Failed to export data");
    } finally {
      setExporting(false);
    }
  };

  const totalPages = Math.max(1, Math.ceil(sortedCustomers.length / pageSize));
  const startIndex = (currentPage - 1) * pageSize;
  const paginatedCustomers = sortedCustomers.slice(
    startIndex,
    startIndex + pageSize,
  );

  return (
    <div className="space-y-6">
      {/* Controls Section */}
      <div className="glass-card p-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
          <h2
            className="text-2xl font-bold"
            style={{ color: "var(--navy-900)" }}
          >
            🧑‍💼 Manage Customers
          </h2>
          <div className="flex gap-2 flex-wrap">
            <button
              onClick={handleExportExcel}
              disabled={exporting || customers.length === 0}
              className="btn btn-sm bg-green-600 hover:bg-green-700 text-white"
            >
              {exporting ? "Exporting..." : "📊 Export Excel"}
            </button>
            <button
              onClick={onRefresh}
              disabled={loading}
              className="btn btn-sm bg-blue-600 hover:bg-blue-700 text-white"
            >
              🔄 Refresh
            </button>
            <button
              onClick={onAddCustomer}
              className="btn btn-sm bg-orange-600 hover:bg-orange-700 text-white"
            >
              ➕ Add Customer
            </button>
          </div>
        </div>

        {/* Search and Filter */}
        <div className="flex flex-col sm:flex-row gap-4 mb-6">
          <div className="flex-1">
            <input
              type="text"
              placeholder="Search by name, email, or phone..."
              value={searchTerm}
              onChange={(e) => onSearchChange(e.target.value)}
              className="w-full px-4 py-2 rounded-lg border"
              style={{
                borderColor: "var(--navy-300)",
                background: "rgba(255,255,255,0.8)",
              }}
            />
          </div>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as any)}
            className="px-4 py-2 rounded-lg border"
            style={{
              borderColor: "var(--navy-300)",
              background: "rgba(255,255,255,0.8)",
            }}
          >
            <option value="name">Sort by Name</option>
            <option value="date">Sort by Date</option>
            <option value="status">Sort by Status</option>
          </select>
        </div>
      </div>

      {/* Customers Table - Responsive */}
      <div className="glass-card overflow-hidden">
        {loading ? (
          <div className="p-12 text-center">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-orange-600"></div>
            <p className="mt-3" style={{ color: "var(--navy-600)" }}>
              Loading customers...
            </p>
          </div>
        ) : sortedCustomers.length === 0 ? (
          <div className="p-12 text-center">
            <p style={{ color: "var(--navy-600)" }} className="text-lg mb-4">
              No customers found
            </p>
            <button
              onClick={onAddCustomer}
              className="inline-block bg-gradient-to-r from-orange-600 to-orange-500 text-white px-6 py-2 rounded-lg font-semibold"
            >
              Add Your First Customer
            </button>
          </div>
        ) : (
          <>
            {/* Desktop Table */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr
                    style={{
                      background: "rgba(255,255,255,0.3)",
                      borderBottom: "1px solid rgba(255,255,255,0.3)",
                    }}
                  >
                    <th
                      className="px-6 py-3 text-left text-sm font-semibold"
                      style={{ color: "var(--navy-900)" }}
                    >
                      Name
                    </th>
                    <th
                      className="px-6 py-3 text-left text-sm font-semibold"
                      style={{ color: "var(--navy-900)" }}
                    >
                      Secret Code
                    </th>
                    <th
                      className="px-6 py-3 text-left text-sm font-semibold"
                      style={{ color: "var(--navy-900)" }}
                    >
                      Contact
                    </th>
                    <th
                      className="px-6 py-3 text-left text-sm font-semibold"
                      style={{ color: "var(--navy-900)" }}
                    >
                      Status
                    </th>
                    <th
                      className="px-6 py-3 text-left text-sm font-semibold"
                      style={{ color: "var(--navy-900)" }}
                    >
                      Related
                    </th>
                    <th
                      className="px-6 py-3 text-left text-sm font-semibold"
                      style={{ color: "var(--navy-900)" }}
                    >
                      Meetings
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedCustomers.map((customer) => (
                    <tr
                      key={customer.id}
                      style={{
                        borderBottom: "1px solid rgba(255,255,255,0.2)",
                      }}
                      className="hover:bg-white/20 transition-colors"
                    >
                      <td className="px-6 py-4">
                        <div>
                          <p
                            style={{ color: "var(--navy-900)" }}
                            className="font-semibold"
                          >
                            {customer.name || customer.nickname || "N/A"}
                          </p>
                          <p
                            style={{ color: "var(--navy-600)" }}
                            className="text-xs"
                          >
                            {customer.address || "No address"}
                          </p>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span
                          className="inline-block px-2 py-1 rounded text-xs font-bold"
                          style={{
                            color: "var(--navy-700)",
                            background: "rgba(37, 88, 168, 0.12)",
                            fontFamily: "var(--font-mono)",
                          }}
                        >
                          {customer.secret_code || "N/A"}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <div>
                          <p
                            style={{ color: "var(--navy-900)" }}
                            className="text-sm break-all"
                          >
                            {customer.email || "N/A"}
                          </p>
                          <p
                            style={{ color: "var(--navy-600)" }}
                            className="text-xs"
                          >
                            {customer.phone || "No phone"}
                          </p>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span
                          className="inline-block px-3 py-1 rounded-full text-xs font-bold"
                          style={{
                            background:
                              customer.is_active === 1
                                ? "rgba(74, 222, 128, 0.2)"
                                : "rgba(209, 213, 219, 0.3)",
                            color:
                              customer.is_active === 1
                                ? "var(--navy-900)"
                                : "var(--navy-600)",
                          }}
                        >
                          {customer.is_active === 1 ? "✓ Active" : "⊘ Inactive"}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <p
                          style={{ color: "var(--navy-900)" }}
                          className="font-semibold text-sm"
                        >
                          {(customer.projects || []).length > 0
                            ? (customer.projects || [])
                                .slice(0, 2)
                                .map((p) => p.project_name)
                                .filter(Boolean)
                                .join(", ")
                            : "No project"}
                        </p>
                      </td>
                      <td className="px-6 py-4">
                        <p
                          style={{ color: "var(--navy-900)" }}
                          className="font-semibold"
                        >
                          {customer.projects?.length || 0} meetings
                        </p>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile Cards */}
            <div className="md:hidden divide-y divide-white/20">
              {paginatedCustomers.map((customer) => (
                <div key={customer.id} className="p-4 space-y-3">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <p
                        style={{ color: "var(--navy-900)" }}
                        className="font-bold"
                      >
                        {customer.name || customer.nickname || "N/A"}
                      </p>
                      <p
                        style={{ color: "var(--navy-600)" }}
                        className="text-xs"
                      >
                        {customer.address || "No address"}
                      </p>
                    </div>
                    <span
                      className="px-2 py-1 rounded text-xs font-bold whitespace-nowrap"
                      style={{
                        background:
                          customer.is_active === 1
                            ? "rgba(74, 222, 128, 0.2)"
                            : "rgba(209, 213, 219, 0.3)",
                        color:
                          customer.is_active === 1
                            ? "var(--navy-900)"
                            : "var(--navy-600)",
                      }}
                    >
                      {customer.is_active === 1 ? "✓ Active" : "⊘ Inactive"}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <p style={{ color: "var(--navy-600)" }}>Secret Code</p>
                      <p
                        style={{
                          color: "var(--navy-900)",
                          fontFamily: "var(--font-mono)",
                        }}
                        className="font-semibold"
                      >
                        {customer.secret_code || "N/A"}
                      </p>
                    </div>
                    <div>
                      <p style={{ color: "var(--navy-600)" }}>Email</p>
                      <p
                        style={{ color: "var(--navy-900)" }}
                        className="font-semibold break-all"
                      >
                        {customer.email || "N/A"}
                      </p>
                    </div>
                    <div>
                      <p style={{ color: "var(--navy-600)" }}>Phone</p>
                      <p
                        style={{ color: "var(--navy-900)" }}
                        className="font-semibold"
                      >
                        {customer.phone || "N/A"}
                      </p>
                    </div>
                    <div>
                      <p style={{ color: "var(--navy-600)" }}>Related</p>
                      <p
                        style={{ color: "var(--navy-900)" }}
                        className="font-semibold"
                      >
                        {(customer.projects || []).length > 0
                          ? (customer.projects || [])[0]?.project_name ||
                            "No project"
                          : "No project"}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="flex items-center justify-between gap-3 px-4 py-3 border-t border-white/20">
              <p
                className="text-xs sm:text-sm"
                style={{ color: "var(--navy-600)" }}
              >
                Page {currentPage} of {totalPages}
              </p>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  className="px-3 py-1.5 rounded-md text-xs font-semibold bg-white/70 disabled:opacity-50"
                  style={{ color: "var(--navy-900)" }}
                >
                  Prev
                </button>
                <button
                  onClick={() =>
                    setCurrentPage((p) => Math.min(totalPages, p + 1))
                  }
                  disabled={currentPage === totalPages}
                  className="px-3 py-1.5 rounded-md text-xs font-semibold bg-white/70 disabled:opacity-50"
                  style={{ color: "var(--navy-900)" }}
                >
                  Next
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Summary */}
      {sortedCustomers.length > 0 && (
        <div className="glass-card p-4 text-center">
          <p style={{ color: "var(--navy-600)" }} className="text-sm">
            Showing <span className="font-bold">{startIndex + 1}</span> to{" "}
            <span className="font-bold">
              {Math.min(startIndex + pageSize, sortedCustomers.length)}
            </span>{" "}
            of <span className="font-bold">{sortedCustomers.length}</span>{" "}
            customers
          </p>
        </div>
      )}
    </div>
  );
}
