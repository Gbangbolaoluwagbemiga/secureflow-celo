"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useWeb3 } from "@/contexts/web3-context";
import { AlertCircle, CheckCircle2, Loader2 } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { HASHKEY_MAINNET } from "@/lib/web3/config";

interface NetworkSetupDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function NetworkSetupDialog({
  open,
  onOpenChange,
}: NetworkSetupDialogProps) {
  const { addHashKeyNetwork, switchToHashKey } = useWeb3();
  const [isAdding, setIsAdding] = useState(false);
  const [isSwitching, setIsSwitching] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleAddNetwork = async () => {
    setIsAdding(true);
    setError(null);
    setSuccess(false);

    try {
      const added = await addHashKeyNetwork();
      if (added) {
        setSuccess(true);
        // Try to switch after a short delay
        setTimeout(async () => {
          setIsSwitching(true);
          try {
            await switchToHashKey();
            // Close dialog after successful switch
            setTimeout(() => {
              onOpenChange(false);
              setSuccess(false);
              setIsSwitching(false);
            }, 1500);
          } catch (switchError) {
            setIsSwitching(false);
            // User can switch manually
          }
        }, 2000);
      } else {
        setError(
          "Failed to add HashKey Chain. Please try again or add it manually."
        );
      }
    } catch (err: any) {
      setError(err.message || "Failed to add network. Please try again.");
    } finally {
      setIsAdding(false);
    }
  };

  const handleSwitchNetwork = async () => {
    setIsSwitching(true);
    setError(null);

    try {
      await switchToHashKey();
      setSuccess(true);
      setTimeout(() => {
        onOpenChange(false);
        setSuccess(false);
        setIsSwitching(false);
      }, 1500);
    } catch (err: any) {
      setError(err.message || "Failed to switch network. Please try again.");
      setIsSwitching(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertCircle className="h-5 w-5 text-amber-500" />
            HashKey Chain Required
          </DialogTitle>
          <DialogDescription className="pt-2">
            To use SecureFlow on HashKey, you need to add and connect to HashKey
            Chain in your wallet.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {success && (
            <Alert className="border-green-500 bg-green-50 dark:bg-green-950">
              <CheckCircle2 className="h-4 w-4 text-green-600" />
              <AlertTitle className="text-green-800 dark:text-green-200">
                Network Added Successfully!
              </AlertTitle>
              <AlertDescription className="text-green-700 dark:text-green-300">
                {isSwitching
                  ? "Switching to HashKey Chain..."
                  : "Please switch to HashKey Chain in your wallet to continue."}
              </AlertDescription>
            </Alert>
          )}

          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Error</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <div className="rounded-lg border bg-muted/50 p-4 space-y-3">
            <div>
              <h4 className="font-semibold text-sm mb-2">Network Details:</h4>
              <div className="space-y-1 text-sm text-muted-foreground">
                <div className="flex justify-between">
                  <span>Network Name:</span>
                  <span className="font-mono">{HASHKEY_MAINNET.chainName}</span>
                </div>
                <div className="flex justify-between">
                  <span>Chain ID:</span>
                  <span className="font-mono">
                    {Number.parseInt(HASHKEY_MAINNET.chainId, 16)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>Currency:</span>
                  <span className="font-mono">
                    {HASHKEY_MAINNET.nativeCurrency.symbol}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>RPC URL:</span>
                  <span className="font-mono text-xs">mainnet.hsk.xyz</span>
                </div>
              </div>
            </div>
          </div>

          <div className="text-sm text-muted-foreground">
            <p>
              Don't have HSK tokens? You can get them from:
            </p>
            <ul className="list-disc list-inside mt-2 space-y-1">
              <li>
                <a
                  href="https://hashkey.blockscout.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:underline"
                >
                  HashKey Explorer
                </a>
              </li>
              <li>
                <a
                  href="https://docs.hashkeychain.net/docs/Developer-QuickStart"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:underline"
                >
                  HashKey Chain Developer QuickStart
                </a>
              </li>
            </ul>
          </div>
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isAdding || isSwitching}
          >
            Cancel
          </Button>
          {!success ? (
            <Button
              onClick={handleAddNetwork}
              disabled={isAdding || isSwitching}
              className="min-w-[140px]"
            >
              {isAdding ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Adding...
                </>
              ) : (
                "Add HashKey Chain"
              )}
            </Button>
          ) : (
            <Button
              onClick={handleSwitchNetwork}
              disabled={isSwitching}
              className="min-w-[140px]"
            >
              {isSwitching ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Switching...
                </>
              ) : (
                "Switch to HashKey"
              )}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

