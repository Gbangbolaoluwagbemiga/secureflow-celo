"use client";

import React from "react";
import { Badge } from "@/components/ui/badge";
import { Shield, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface VerificationBadgeProps {
  verified: boolean;
  className?: string;
  variant?: "default" | "compact";
}

export function VerificationBadge({
  verified,
  className,
  variant = "default",
}: VerificationBadgeProps) {
  if (!verified) return null;

  return (
    <Badge
      variant="outline"
      className={cn(
        "border-green-500 bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-300",
        variant === "compact" ? "px-1.5 py-0.5 text-xs" : "px-2 py-1",
        className
      )}
    >
      {variant === "compact" ? (
        <CheckCircle2 className="w-3 h-3" />
      ) : (
        <>
          <Shield className="w-3 h-3 mr-1" />
          Verified
        </>
      )}
    </Badge>
  );
}

