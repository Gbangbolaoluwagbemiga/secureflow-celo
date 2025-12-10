"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Wallet, ExternalLink, Zap } from "lucide-react";
import { useWeb3 } from "@/contexts/web3-context";
import { GDOLLARBalance } from "./gdollar-balance";

export function GoodWalletConnect() {
  const { wallet } = useWeb3();

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

        <div className="flex gap-2 pt-2">
          <Button
            variant="default"
            onClick={() => window.open("https://wallet.gooddollar.org/", "_blank")}
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

