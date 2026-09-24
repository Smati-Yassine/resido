"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { signOutAction } from "@/lib/actions/preferences";
import { useToast } from "@/components/ui/Toaster";

/** Signs out, says so, and returns to the sign-in page. */
export function useSignOut() {
  const toast = useToast();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const run = () =>
    startTransition(async () => {
      const result = await signOutAction();
      toast({ tone: "info", text: result.message });
      router.replace("/");
      router.refresh();
    });
  return { run, pending };
}
