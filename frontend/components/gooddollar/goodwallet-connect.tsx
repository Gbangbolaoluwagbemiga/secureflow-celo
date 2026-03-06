"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Wallet, ExternalLink, Zap, RefreshCw, ChevronDown, ChevronUp } from "lucide-react";
import { useWeb3 } from "@/contexts/web3-context";
import { useToast } from "@/hooks/use-toast";
import { GDOLLARBalance } from "./gdollar-balance";
import { projectId, metadata } from "@/lib/web3/reown-config";
import { useAppKit } from "@reown/appkit/react";

// Import the web component
import "@goodsdks/ui-components";

export function GoodWalletConnect() {
  const { wallet } = useWeb3();
  const { toast } = useToast();
  const [isComponentReady, setIsComponentReady] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);

  const { open } = useAppKit();

  const handleFixNetwork = () => {
    // Open the AppKit networks modal to let the user select Fuse directly.
    // This is more reliable than window.ethereum across different wallet types (like WalletConnect).
    open({ view: 'Networks' });
  };

  useEffect(() => {
    // We rely on the reown-config.tsx networks array to inform the wallet about Fuse natively now.

    // Mark as ready once the web component is defined
    if (typeof customElements !== "undefined") {
      customElements.whenDefined("claim-button").then(() => {
        setIsComponentReady(true);
      });
    }
  }, []);

  // Sync config whenever component is ready or wallet connection changes
  useEffect(() => {
    if (isComponentReady) {
      const updateConfig = () => {
        const claimBtns = document.querySelectorAll("claim-button");
        claimBtns.forEach(btn => {
          (btn as any).appkitConfig = { projectId, metadata };
          // Fallback for some SDK versions
          (btn as any).web3Config = { projectId, metadata };
          // Also try setting as attribute for good measure
          btn.setAttribute("project-id", projectId);
        });
      };

      updateConfig();
      // Periodically check/refresh if it hasn't caught the connection
      const interval = setInterval(updateConfig, 2000);
      return () => clearInterval(interval);
    }
  }, [isComponentReady, wallet.isConnected]);

  return (
    <Card className="border-2 border-primary/20">
      <CardHeader
        className="cursor-pointer hover:bg-muted/50 transition-colors"
        onClick={() => setIsCollapsed(!isCollapsed)}
      >
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <CardTitle className="flex items-center gap-2">
              <Zap className="h-5 w-5 text-primary" />
              GoodWallet Integration
            </CardTitle>
            <CardDescription>
              Connect with GoodWallet to claim G$ UBI and make payments
            </CardDescription>
          </div>
          <Button variant="ghost" size="icon" className="shrink-0">
            {isCollapsed ? <ChevronDown className="h-5 w-5" /> : <ChevronUp className="h-5 w-5" />}
          </Button>
        </div>
      </CardHeader>

      {!isCollapsed && (
        <CardContent className="space-y-4 pt-4 border-t">
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">
              GoodWallet is a multi-chain wallet that supports G$ (GoodDollar) tokens on Celo.
              Use it to:
            </p>
            <ul className="text-sm text-muted-foreground list-disc list-inside space-y-1">
              <li>Claim your daily G$ Universal Basic Income</li>
              <li>Send and receive G$ tokens</li>
              <li>Bridge G$ between networks</li>
              <li>Pay for services on SecureFlow</li>
            </ul>
          </div>

          {wallet.isConnected && (
            <div className="pt-2">
              <GDOLLARBalance compact />
            </div>
          )}

          {/* GoodDollar Claim Button Integration */}
          <div className="my-4 flex justify-center bg-gray-50 p-4 rounded-lg border border-gray-100 min-h-[60px]">
            {isComponentReady ? (
              /* @ts-ignore */
              <claim-button environment="production" />
            ) : (
              <div className="flex items-center gap-2 text-sm text-muted-foreground animate-pulse">
                <Zap className="h-4 w-4" />
                Preparing claim button...
              </div>
            )}
          </div>

          <div className="flex gap-2 pt-2">
            <Button
              variant="default"
              onClick={() => window.open("https://goodwallet.xyz/", "_blank")}
              className="flex-1"
            >
              <Wallet className="h-4 w-4 mr-2" />
              Open GoodWallet
            </Button>
            <Button
              variant="outline"
              onClick={handleFixNetwork}
              title="Open Network Switcher"
            >
              <RefreshCw className="h-4 w-4 mr-2" />
              Fix Network
            </Button>
            <Button
              variant="outline"
              onClick={() => window.open("https://docs.gooddollar.org/", "_blank")}
            >
              <ExternalLink className="h-4 w-4" />
            </Button>
          </div>

          <div className="pt-2 border-t">
            <p className="text-xs text-muted-foreground">
              💡 Tip: GoodWallet supports WalletConnect. Connect it to SecureFlow to use G$ for escrow payments!
            </p>
          </div>
        </CardContent>
      )}
    </Card>
  );
}
