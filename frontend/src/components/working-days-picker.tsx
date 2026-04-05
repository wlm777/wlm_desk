"use client";

import { cn } from "@/lib/utils";

const DAYS = [
  { value: "1", label: "Mon" },
  { value: "2", label: "Tue" },
  { value: "3", label: "Wed" },
  { value: "4", label: "Thu" },
  { value: "5", label: "Fri" },
  { value: "6", label: "Sat" },
  { value: "7", label: "Sun" },
];

interface WorkingDaysPickerProps {
  value: string; // "1,2,3,4,5"
  onChange: (value: string) => void;
}

export function WorkingDaysPicker({ value, onChange }: WorkingDaysPickerProps) {
  const selected = new Set(value.split(",").map((d) => d.trim()).filter(Boolean));

  function toggle(day: string) {
    const next = new Set(selected);
    if (next.has(day)) {
      next.delete(day);
    } else {
      next.add(day);
    }
    onChange(
      DAYS.filter((d) => next.has(d.value))
        .map((d) => d.value)
        .join(",")
    );
  }

  return (
    <div className="flex gap-1">
      {DAYS.map((d) => (
        <button
          key={d.value}
          type="button"
          onClick={() => toggle(d.value)}
          className={cn(
            "w-9 h-8 text-[11px] font-medium rounded-md transition-colors",
            selected.has(d.value)
              ? "bg-primary-600 text-white"
              : "bg-gray-100 text-gray-500 hover:bg-gray-200"
          )}
        >
          {d.label}
        </button>
      ))}
    </div>
  );
}
