"use client";

import { useWeb3 } from "@/contexts/web3-context";
import { Card } from "@/components/ui/card";

export function EOABalance() {
  const { wallet } = useWeb3();

  if (!wallet.isConnected) return null;

  return (
    <Card className="glass border-muted/20 px-3 py-2">
      <div className="flex items-center gap-2 text-xs">
        <span className="text-muted-foreground">EOA</span>
        <span className="font-mono">
          {Number(wallet.balance).toFixed(4)} HSK
        </span>
      </div>
    </Card>
  );
}
