"use client";

import { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { ChevronDown, X } from "lucide-react";

const TIMEZONES = [
  "UTC",
  "America/New_York", "America/Chicago", "America/Denver", "America/Los_Angeles",
  "America/Toronto", "America/Vancouver", "America/Sao_Paulo", "America/Argentina/Buenos_Aires",
  "Europe/London", "Europe/Paris", "Europe/Berlin", "Europe/Madrid", "Europe/Rome",
  "Europe/Amsterdam", "Europe/Brussels", "Europe/Zurich", "Europe/Vienna",
  "Europe/Warsaw", "Europe/Prague", "Europe/Budapest", "Europe/Bucharest",
  "Europe/Kyiv", "Europe/Moscow", "Europe/Istanbul", "Europe/Athens",
  "Europe/Helsinki", "Europe/Stockholm", "Europe/Oslo", "Europe/Copenhagen",
  "Asia/Dubai", "Asia/Riyadh", "Asia/Tehran",
  "Asia/Kolkata", "Asia/Colombo", "Asia/Dhaka",
  "Asia/Bangkok", "Asia/Jakarta", "Asia/Singapore", "Asia/Kuala_Lumpur",
  "Asia/Hong_Kong", "Asia/Shanghai", "Asia/Taipei",
  "Asia/Seoul", "Asia/Tokyo",
  "Australia/Sydney", "Australia/Melbourne", "Australia/Perth",
  "Pacific/Auckland", "Pacific/Fiji",
  "Africa/Cairo", "Africa/Johannesburg", "Africa/Lagos", "Africa/Nairobi",
];

interface TimezonePickerProps {
  value: string;
  onChange: (tz: string) => void;
}

export function TimezonePicker({ value, onChange }: TimezonePickerProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [pos, setPos] = useState<{ top: number; left: number; width: number } | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const dropRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    if (btnRef.current) {
      const r = btnRef.current.getBoundingClientRect();
      setPos({ top: r.bottom + 4, left: r.left, width: Math.max(r.width, 280) });
    }
    setTimeout(() => inputRef.current?.focus(), 0);

    function handleOutside(e: MouseEvent) {
      if (btnRef.current?.contains(e.target as Node)) return;
      if (dropRef.current?.contains(e.target as Node)) return;
      setOpen(false);
    }
    document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, [open]);

  const filtered = TIMEZONES.filter((tz) => tz.toLowerCase().includes(search.toLowerCase()));

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={() => { setOpen(!open); setSearch(""); }}
        className="w-full flex items-center justify-between text-sm text-gray-900 py-2 border-b border-gray-200 hover:border-primary-500 transition-colors text-left"
      >
        <span className="truncate">{value || "Select timezone"}</span>
        <ChevronDown className="w-3.5 h-3.5 text-gray-400 shrink-0" />
      </button>

      {open && pos && typeof document !== "undefined" && createPortal(
        <div
          ref={dropRef}
          className="fixed bg-white border border-gray-200 rounded-lg shadow-xl overflow-hidden"
          style={{ top: pos.top, left: pos.left, width: pos.width, zIndex: 9999 }}
        >
          <div className="p-2 border-b border-gray-100">
            <input
              ref={inputRef}
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search timezone..."
              className="w-full px-2 py-1.5 text-sm border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-primary-500"
            />
          </div>
          <div className="max-h-48 overflow-y-auto">
            {filtered.map((tz) => (
              <button
                key={tz}
                type="button"
                onClick={() => { onChange(tz); setOpen(false); }}
                className={`w-full text-left px-3 py-1.5 text-sm hover:bg-gray-50 transition-colors ${value === tz ? "bg-primary-50 text-primary-700 font-medium" : "text-gray-700"}`}
              >
                {tz}
              </button>
            ))}
            {filtered.length === 0 && (
              <p className="px-3 py-2 text-sm text-gray-400">No timezones found</p>
            )}
          </div>
        </div>,
        document.body
      )}
    </>
  );
}
