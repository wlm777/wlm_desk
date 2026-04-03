"use client";

import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { api } from "@/lib/api";
import { isAuthenticated } from "@/lib/auth";
import type { User } from "@/lib/types";

export function useAuth({ redirect = true } = {}) {
  const router = useRouter();
  const authenticated = isAuthenticated();

  const { data: user, isLoading } = useQuery<User>({
    queryKey: ["auth", "me"],
    queryFn: () => api.get("/api/v1/auth/me"),
    enabled: authenticated,
    retry: false,
  });

  useEffect(() => {
    if (!authenticated && redirect) {
      router.replace("/login");
    }
  }, [authenticated, redirect, router]);

  return { user: user ?? null, isLoading, isAuthenticated: authenticated };
}
