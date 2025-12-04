"use client";

import React, { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useSelfVerification } from "@/contexts/self-verification-context";
import { Shield, CheckCircle2, XCircle, Loader2 } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";

interface SelfVerificationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  required?: boolean; // If true, user must verify before proceeding
}

export function SelfVerificationDialog({
  open,
  onOpenChange,
  required = false,
}: SelfVerificationDialogProps) {
  const {
    isVerified,
    isVerifying,
    verificationTimestamp,
    verifyIdentity,
    checkVerificationStatus,
    SelfVerificationComponent,
  } = useSelfVerification();

  const [showQRCode, setShowQRCode] = useState(false);

  const handleVerify = async () => {
    setShowQRCode(true);
    await verifyIdentity();
  };

  const handleCheckStatus = async () => {
    await checkVerificationStatus();
  };

  return (
    <Dialog open={open} onOpenChange={required && isVerified ? undefined : onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Shield className="w-5 h-5" />
            Identity Verification
          </DialogTitle>
          <DialogDescription>
            Verify your identity using Self Protocol to access premium features and build trust on the platform.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Verification Status */}
          {isVerified ? (
            <Alert className="border-green-500 bg-green-50 dark:bg-green-950">
              <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400" />
              <AlertDescription className="text-green-800 dark:text-green-200">
                <div className="font-semibold">You are verified!</div>
                {verificationTimestamp && (
                  <div className="text-sm mt-1">
                    Verified on {new Date(verificationTimestamp * 1000).toLocaleDateString()}
                  </div>
                )}
              </AlertDescription>
            </Alert>
          ) : (
            <Alert>
              <XCircle className="h-4 w-4" />
              <AlertDescription>
                You need to verify your identity to apply for jobs and build reputation.
              </AlertDescription>
            </Alert>
          )}

          {/* QR Code Component */}
          {showQRCode && !isVerified && (
            <div className="border rounded-lg p-4 bg-gray-50 dark:bg-gray-900">
              <SelfVerificationComponent />
            </div>
          )}

          {/* Action Buttons */}
          {!isVerified && (
            <div className="flex flex-col gap-2">
              {!showQRCode ? (
                <Button
                  onClick={handleVerify}
                  disabled={isVerifying}
                  className="w-full"
                  size="lg"
                >
                  {isVerifying ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Starting Verification...
                    </>
                  ) : (
                    <>
                      <Shield className="mr-2 h-4 w-4" />
                      Start Verification
                    </>
                  )}
                </Button>
              ) : (
                <Button
                  onClick={handleCheckStatus}
                  disabled={isVerifying}
                  variant="outline"
                  className="w-full"
                >
                  {isVerifying ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Checking Status...
                    </>
                  ) : (
                    "Check Verification Status"
                  )}
                </Button>
              )}
            </div>
          )}

          {/* Info */}
          <div className="text-xs text-muted-foreground space-y-1">
            <p>• Verification uses zero-knowledge proofs - your privacy is protected</p>
            <p>• Prevents fake accounts and Sybil attacks</p>
            <p>• Required for job applications and reputation building</p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

