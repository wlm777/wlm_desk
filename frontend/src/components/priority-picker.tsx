"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { Flag } from "lucide-react";
import { PRIORITY_CONFIG } from "@/lib/constants";
import { cn } from "@/lib/utils";
import type { TaskPriority } from "@/lib/types";

/** Flag icon colored by priority */
export function PriorityFlag({ priority, className }: { priority: TaskPriority; className?: string }) {
  const cfg = PRIORITY_CONFIG[priority];
  return <Flag className={cn("w-3.5 h-3.5", className)} style={{ color: cfg.flag }} fill={cfg.flag} />;
}

/** Inline badge: flag + label with bg */
export function PriorityBadge({ priority }: { priority: TaskPriority }) {
  const cfg = PRIORITY_CONFIG[priority];
  return (
    <span className={cn("inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded", cfg.bg, cfg.color)}>
      <Flag className="w-2.5 h-2.5" style={{ color: cfg.flag }} fill={cfg.flag} />
      {cfg.label}
    </span>
  );
}

/** Styled dropdown picker for priority — renders dropdown via portal to avoid clipping */
export function PriorityPicker({
  value,
  onChange,
  size = "default",
}: {
  value: TaskPriority;
  onChange: (p: TaskPriority) => void;
  size?: "default" | "large";
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const computePosition = useCallback(() => {
    if (!btnRef.current) return;
    const rect = btnRef.current.getBoundingClientRect();
    const dropdownWidth = 144;

    let left = rect.right - dropdownWidth;
    if (left < 8) left = rect.left;
    if (left + dropdownWidth > window.innerWidth - 8) {
      left = window.innerWidth - dropdownWidth - 8;
    }

    setPos({ top: rect.bottom + 4, left });
  }, []);

  useEffect(() => {
    if (!open) return;
    computePosition();

    function handleClickOutside(e: MouseEvent) {
      const target = e.target as Node;
      // Don't close if click is inside the trigger button or the dropdown
      if (btnRef.current?.contains(target)) return;
      if (dropdownRef.current?.contains(target)) return;
      setOpen(false);
    }

    document.addEventListener("mousedown", handleClickOutside);
    window.addEventListener("scroll", computePosition, true);
    window.addEventListener("resize", computePosition);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      window.removeEventListener("scroll", computePosition, true);
      window.removeEventListener("resize", computePosition);
    };
  }, [open, computePosition]);

  const current = PRIORITY_CONFIG[value];

  function handleSelect(key: TaskPriority) {
    onChange(key);
    setOpen(false);
  }

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={() => setOpen(!open)}
        className={cn(
          "inline-flex items-center font-medium transition-colors",
          size === "large"
            ? "gap-1.5 text-xs px-3 h-[38px] rounded-lg border border-gray-300"
            : "gap-1 text-[10px] px-2 py-0.5 rounded-md",
          current.bg, current.color
        )}
      >
        <Flag className={size === "large" ? "w-3 h-3" : "w-2.5 h-2.5"} style={{ color: current.flag }} fill={current.flag} />
        {current.label}
      </button>

      {open && pos && typeof document !== "undefined" && createPortal(
        <div
          ref={dropdownRef}
          className="fixed w-36 bg-white border border-gray-200 rounded-lg shadow-xl py-1"
          style={{ top: pos.top, left: pos.left, zIndex: 9999 }}
        >
          {(Object.entries(PRIORITY_CONFIG) as [TaskPriority, typeof current][]).map(([key, cfg]) => (
            <button
              key={key}
              type="button"
              onClick={() => handleSelect(key)}
              className={cn(
                "w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-gray-50 transition-colors",
                value === key && "bg-gray-50"
              )}
            >
              <Flag className="w-3.5 h-3.5" style={{ color: cfg.flag }} fill={cfg.flag} />
              <span className={cfg.color}>{cfg.label}</span>
            </button>
          ))}
        </div>,
        document.body
      )}
    </>
  );
}
