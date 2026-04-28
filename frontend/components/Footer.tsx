// components/Footer.tsx
import React from "react";

export default function Footer() {
  return (
    <footer
      className="w-full py-4 px-4 md:px-8"
      style={{ background: "var(--gradient-header)", borderTop: "1px solid rgba(255,255,255,0.08)" }}
    >
      <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2">
        <p className="text-xs md:text-sm text-center sm:text-left" style={{ color: "rgba(255,255,255,0.7)" }}>
          © 2026 Developed by{" "}
          <span className="font-bold" style={{ color: "#ffffff" }}>Ramanora Global Pvt Ltd</span>
        </p>
        <a
          href="https://ramanora.com"
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs md:text-sm font-semibold transition-opacity hover:opacity-75"
          style={{ color: "var(--gold-400)" }}
        >
          ramanora.com →
        </a>
      </div>
    </footer>
  );
}