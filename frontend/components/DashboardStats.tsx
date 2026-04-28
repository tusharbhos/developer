"use client";

import React from "react";

interface DashboardStatsProps {
  stats: {
    totalCustomers: number;
    activeCustomers: number;
    inactiveCustomers: number;
    upcomingMeetings: number;
  };
}

export default function DashboardStats({ stats }: DashboardStatsProps) {
  const statCards = [
    {
      label: "Total Customers",
      value: stats.totalCustomers,
      icon: "👥",
      color: "from-blue-500 to-blue-600",
    },
    {
      label: "Active Customers",
      value: stats.activeCustomers,
      icon: "✓",
      color: "from-green-500 to-green-600",
    },
    {
      label: "Inactive Customers",
      value: stats.inactiveCustomers,
      icon: "⊘",
      color: "from-gray-500 to-gray-600",
    },
    {
      label: "Upcoming Meetings",
      value: stats.upcomingMeetings,
      icon: "📅",
      color: "from-orange-500 to-orange-600",
    },
  ];

  return (
    <div className="mb-8 grid grid-cols-4 gap-2 sm:grid-cols-2 sm:gap-4 lg:grid-cols-4">
      {statCards.map((card, idx) => (
        <div
          key={idx}
          className="glass-card rounded-none p-2.5 sm:p-6 relative overflow-hidden group hover:shadow-xl transition-all duration-300"
        >
          {/* Background gradient effect */}
          <div
            className="absolute inset-0 opacity-10"
            style={{ background: card.color }}
          ></div>

          <div className="relative z-10">
            <div className="mb-2 sm:mb-3">
              <span className="hidden text-3xl sm:inline">{card.icon}</span>
            </div>

            <p
              style={{ color: "var(--navy-600)" }}
              className="text-[9px] sm:text-xs font-semibold uppercase tracking-wide mb-1 leading-tight"
            >
              {card.label}
            </p>

            <p
              style={{ color: "var(--navy-900)" }}
              className="text-xl sm:text-4xl font-bold leading-none"
            >
              {card.value}
            </p>
          </div>

          {/* Top border accent */}
          <div
            className={`absolute top-0 left-0 right-0 h-1 bg-linear-to-r ${card.color}`}
          ></div>
        </div>
      ))}
    </div>
  );
}
