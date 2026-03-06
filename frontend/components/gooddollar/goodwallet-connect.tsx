"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Wallet, ExternalLink, Zap } from "lucide-react";
import { useWeb3 } from "@/contexts/web3-context";
import { GDOLLARBalance } from "./gdollar-balance";
import { projectId, metadata } from "@/lib/web3/reown-config";

// Import the web component
import "@goodsdks/ui-components";

export function GoodWalletConnect() {
  const { wallet } = useWeb3();
  const [isComponentReady, setIsComponentReady] = useState(false);

  useEffect(() => {
    // Pre-register Fuse Network with the wallet so claim-button can switch to it
    if (typeof window !== "undefined" && window.ethereum) {
      (window.ethereum as any).request({
        method: "wallet_addEthereumChain",
        params: [{
          chainId: "0x7a", // 122 in hex = Fuse Network
          chainName: "Fuse Network",
          nativeCurrency: { name: "Fuse", symbol: "FUSE", decimals: 18 },
          rpcUrls: ["https://rpc.fuse.io", "https://fuse-mainnet.chainstacklabs.com"],
          blockExplorerUrls: ["https://explorer.fuse.io"],
        }],
      }).catch((err: any) => {
        console.warn("Fuse Chain registration warning:", err);
      });
    }

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
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Zap className="h-5 w-5 text-primary" />
          GoodWallet Integration
        </CardTitle>
        <CardDescription>
          Connect with GoodWallet to claim G$ UBI and make payments
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
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
    </Card>
  );
}
