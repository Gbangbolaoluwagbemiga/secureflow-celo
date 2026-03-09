"use client";

import React from "react";
import { Badge } from "@/components/ui/badge";
import { Shield, CheckCircle2, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import { useSelfVerification } from "@/contexts/self-verification-context";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

interface VerificationBadgeProps {
  className?: string;
  variant?: "default" | "compact";
}

export function VerificationBadge({
  className,
  variant = "default",
}: VerificationBadgeProps) {
  const { isVerified, isGoodDollarVerified } = useSelfVerification();

  if (!isVerified) return null;

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge
            variant="outline"
            className={cn(
              "border-green-500 bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-300 cursor-help",
              variant === "compact" ? "px-1.5 py-0.5 text-xs" : "px-2 py-1",
              className
            )}
          >
            {variant === "compact" ? (
              isGoodDollarVerified ? <ShieldCheck className="w-3 h-3" /> : <CheckCircle2 className="w-3 h-3" />
            ) : (
              <>
                {isGoodDollarVerified ? <ShieldCheck className="w-3 h-3 mr-1" /> : <Shield className="w-3 h-3 mr-1" />}
                {isGoodDollarVerified ? "G$ Verified" : "Verified"}
              </>
            )}
          </Badge>
        </TooltipTrigger>
        <TooltipContent>
          <p className="text-xs">
            {isGoodDollarVerified
              ? "This user has completed GoodDollar Face Verification"
              : "This user has verified their identity via Self Protocol"}
          </p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

