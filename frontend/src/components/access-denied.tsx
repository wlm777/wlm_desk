"use client";

import { ShieldX } from "lucide-react";
import { useRouter } from "next/navigation";

interface AccessDeniedProps {
  message?: string;
}

export function AccessDenied({ message = "You don't have permission to view this page." }: AccessDeniedProps) {
  const router = useRouter();

  return (
    <div className="flex-1 flex items-center justify-center">
      <div className="text-center max-w-sm">
        <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-4">
          <ShieldX className="w-8 h-8 text-gray-400" />
        </div>
        <h2 className="text-lg font-semibold text-gray-900 mb-1">Access Denied</h2>
        <p className="text-sm text-gray-500 mb-4">{message}</p>
        <button
          onClick={() => router.push("/")}
          className="px-4 py-2 text-sm font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700 transition-colors"
        >
          Go to Dashboard
        </button>
      </div>
    </div>
  );
}
