"use client";

import { useEffect, useState } from "react";
import { useWeb3 } from "@/contexts/web3-context";
import { CONTRACTS } from "@/lib/web3/config";
import { ERC20_ABI } from "@/lib/web3/abis";
import { ethers } from "ethers";
import { Button } from "@/components/ui/button";
import { ExternalLink, Wallet } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

interface GDOLLARBalanceProps {
  showClaimButton?: boolean;
  compact?: boolean;
}

export function GDOLLARBalance({ showClaimButton = true, compact = false }: GDOLLARBalanceProps) {
  const { wallet, getContract } = useWeb3();
  const [balance, setBalance] = useState<string>("0");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const GDOLLAR_ADDRESS = CONTRACTS.GDOLLAR_CELO;

  useEffect(() => {
    if (!wallet.isConnected || !wallet.address || !GDOLLAR_ADDRESS || 
        GDOLLAR_ADDRESS === "0x0000000000000000000000000000000000000000") {
      setBalance("0");
      return;
    }

    const fetchBalance = async () => {
      setLoading(true);
      setError(null);
      try {
        const contract = getContract(GDOLLAR_ADDRESS, ERC20_ABI);
        const balanceWei = await contract.call("balanceOf", wallet.address);
        const formattedBalance = ethers.formatEther(balanceWei);
        setBalance(parseFloat(formattedBalance).toFixed(4));
      } catch (err: any) {
        console.error("Failed to fetch G$ balance:", err);
        setError("Failed to load balance");
        setBalance("0");
      } finally {
        setLoading(false);
      }
    };

    fetchBalance();
    
    // Refresh balance every 30 seconds
    const interval = setInterval(fetchBalance, 30000);
    return () => clearInterval(interval);
  }, [wallet.address, wallet.isConnected, GDOLLAR_ADDRESS, getContract]);

  if (compact) {
    return (
      <div className="flex items-center gap-2 text-sm">
        <Wallet className="h-4 w-4 text-muted-foreground" />
        <span className="font-medium">G$</span>
        <span className={loading ? "text-muted-foreground" : ""}>
          {loading ? "..." : balance}
        </span>
      </div>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Wallet className="h-5 w-5" />
          GoodDollar Balance
        </CardTitle>
        <CardDescription>
          Your G$ (GoodDollar) token balance on Celo
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-baseline gap-2">
          <span className="text-3xl font-bold">{loading ? "..." : balance}</span>
          <span className="text-xl text-muted-foreground">G$</span>
        </div>

        {error && (
          <p className="text-sm text-destructive">{error}</p>
        )}

        {!wallet.isConnected && (
          <p className="text-sm text-muted-foreground">
            Connect your wallet to view your G$ balance
          </p>
        )}

        {showClaimButton && wallet.isConnected && (
          <div className="flex gap-2 pt-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => window.open("https://wallet.gooddollar.org/", "_blank")}
              className="flex-1"
            >
              <ExternalLink className="h-4 w-4 mr-2" />
              Claim G$ UBI
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => 
                window.open(`https://celoscan.io/token/${GDOLLAR_ADDRESS}`, "_blank")
              }
            >
              <ExternalLink className="h-4 w-4" />
            </Button>
          </div>
        )}

        <div className="pt-2 border-t">
          <p className="text-xs text-muted-foreground">
            G$ (GoodDollar) is a Universal Basic Income token. Claim your daily G$ and use it for payments on SecureFlow!
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

