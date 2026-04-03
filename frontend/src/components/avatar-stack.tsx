"use client";

import type { ProjectMember } from "@/lib/types";

interface AvatarStackProps {
  userIds: string[];
  members?: ProjectMember[];
  max?: number;
}

export function AvatarStack({ userIds, members, max = 4 }: AvatarStackProps) {
  if (!userIds.length) return null;

  const shown = userIds.slice(0, max);
  const extra = userIds.length - max;

  return (
    <div className="flex items-center -space-x-1.5">
      {shown.map((uid) => {
        const m = members?.find((x) => x.user_id === uid);
        const color = m?.color || "#E6E7EB";
        const initial = (m?.full_name ?? "?").charAt(0);
        return (
          <span
            key={uid}
            className="w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold text-white ring-2 ring-white shrink-0"
            style={{ backgroundColor: color }}
            title={m?.full_name ?? uid.slice(0, 8)}
          >
            {initial}
          </span>
        );
      })}
      {extra > 0 && (
        <span className="w-5 h-5 rounded-full flex items-center justify-center text-[8px] font-bold text-white bg-gray-200 text-gray-600 ring-2 ring-white shrink-0">
          +{extra}
        </span>
      )}
    </div>
  );
}
