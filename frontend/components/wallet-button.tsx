"use client";

import { Button } from "@/components/ui/button";
import { useWeb3 } from "@/contexts/web3-context";
import { useAppKit, useAppKitAccount } from "@reown/appkit/react";
import { useState, useEffect } from "react";
import { NetworkSetupDialog } from "@/components/network-setup-dialog";

export function WalletButton() {
  const { wallet, switchToHashKey } = useWeb3();
  const { open } = useAppKit();
  const { isConnected: appKitConnected } = useAppKitAccount();
  const [networkIconError, setNetworkIconError] = useState(false);
  const [walletIconError, setWalletIconError] = useState(false);
  const [isOpening, setIsOpening] = useState(false);
  const [showNetworkDialog, setShowNetworkDialog] = useState(false);
  const [hasCheckedNetwork, setHasCheckedNetwork] = useState(false);

  // Show network dialog when wallet is connected but on wrong network
  useEffect(() => {
    if (wallet.address && !wallet.isConnected && !hasCheckedNetwork) {
      // User is connected but on wrong network - show helpful message
      // They can click the button to add network if needed
      setHasCheckedNetwork(true);
    }
  }, [wallet.address, wallet.isConnected, hasCheckedNetwork]);

  const handleClick = async () => {
    // Prevent multiple simultaneous connection attempts
    if (isOpening || appKitConnected) {
      return;
    }
    
    setIsOpening(true);
    try {
      await open?.();
    } catch (error: any) {
      console.error("Failed to open AppKit:", error);
      
      // Check if error is related to network
      const errorMessage = error.message?.toLowerCase() || "";
      if (errorMessage.includes("network") || errorMessage.includes("chain")) {
        setShowNetworkDialog(true);
      }
    } finally {
      // Reset after a delay to allow AppKit modal to open
      setTimeout(() => setIsOpening(false), 1000);
    }
  };

  // If we have an address but are on the wrong network, show options
  if (wallet.address && !wallet.isConnected) {
    return (
      <>
        <Button 
          onClick={() => setShowNetworkDialog(true)} 
          variant="default"
          className="mr-2"
        >
          Add HashKey Chain
        </Button>
        <Button onClick={switchToHashKey} variant="outline">
          Switch to HashKey
        </Button>
        <NetworkSetupDialog 
          open={showNetworkDialog} 
          onOpenChange={setShowNetworkDialog} 
        />
      </>
    );
  }

  if (!wallet.isConnected || !wallet.address) {
    return (
      <>
        <Button onClick={handleClick} variant="default">
          Connect Wallet
        </Button>
        <NetworkSetupDialog 
          open={showNetworkDialog} 
          onOpenChange={setShowNetworkDialog} 
        />
      </>
    );
  }

  return (
    <Button
      onClick={handleClick}
      variant="secondary"
      className="font-mono flex items-center gap-2 px-3 md:px-4 py-2 bg-muted/50 hover:bg-muted/70 border border-border/40 max-w-[160px] md:max-w-none"
    >
      {/* Desktop/tablet: show network + balance + avatar */}
      <div className="hidden md:flex items-center gap-2">
        {/* Dynamic network icon (WalletConnect chain icons) */}
        <div className="w-4 h-4 rounded-full overflow-hidden">
          {!networkIconError ? (
            <img
              src={`https://assets.walletconnect.com/chains/${wallet.chainId}.png`}
              alt="Network"
              className="w-full h-full object-cover"
              onError={() => setNetworkIconError(true)}
            />
          ) : (
            <div className="w-full h-full bg-blue-500 rounded-full flex items-center justify-center">
              <div className="w-2 h-2 bg-white rounded-full"></div>
            </div>
          )}
        </div>

        <span>{Number(wallet.balance).toFixed(3)} HSK</span>
        <span className="text-muted-foreground">·</span>

        {/* Dynamic wallet avatar (Effigy gradient orb) */}
        <div className="w-4 h-4 rounded-full overflow-hidden">
          {!walletIconError ? (
            <img
              src={`https://effigy.im/a/${wallet.address}.svg`}
              alt="Wallet"
              className="w-full h-full object-cover"
              onError={() => setWalletIconError(true)}
            />
          ) : (
            <div className="w-full h-full bg-linear-to-br from-blue-400 to-blue-600 rounded-full"></div>
          )}
        </div>
      </div>

      {/* Always show just the address on mobile; also show on desktop after icons */}
      <span className="truncate md:ml-1" title={wallet.address}>
        {wallet.address.slice(0, 6)}…{wallet.address.slice(-4)}
      </span>
    </Button>
  );
}
