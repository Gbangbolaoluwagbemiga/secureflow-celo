"use client";

import {
  createContext,
  useContext,
  useState,
  useEffect,
  type ReactNode,
} from "react";
import { CELO_MAINNET, CELO_TESTNET, CONTRACTS } from "@/lib/web3/config";
import type { WalletState } from "@/lib/web3/types";
import { useToast } from "@/hooks/use-toast";
import { useAppKit, useAppKitAccount, useAppKitNetwork } from "@reown/appkit/react";
import { ethers } from "ethers";

interface Eip1193Provider {
  request: (args: { method: string; params?: any[] }) => Promise<any>;
  on: (eventName: string, listener: (...args: any[]) => void) => void;
  removeListener: (eventName: string, listener: (...args: any[]) => void) => void;
  providers?: Eip1193Provider[];
  [key: string]: unknown;
}

interface Web3ContextType {
  wallet: WalletState;
  connectWallet: () => Promise<void>;
  disconnectWallet: () => void;
  switchToCelo: () => Promise<void>;
  switchToCeloTestnet: () => Promise<void>;
  addCeloNetwork: () => Promise<boolean>;
  getContract: (address: string, abi: any) => any;
  isOwner: boolean;
}

const Web3Context = createContext<Web3ContextType | undefined>(undefined);

export function Web3Provider({ children }: { children: ReactNode }) {
  const { toast } = useToast();
  const { address: appKitAddress, isConnected: appKitConnected } = useAppKitAccount();
  const { chainId: appKitChainId } = useAppKitNetwork();
  const [wallet, setWallet] = useState<WalletState>({
    address: null,
    chainId: null,
    isConnected: false,
    balance: "0",
  });
  const [isOwner, setIsOwner] = useState(false);
  const [isSwitchingNetwork, setIsSwitchingNetwork] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);

  // Helper to check if Celo network exists in wallet
  const checkCeloNetworkExists = async (): Promise<boolean> => {
    if (typeof window === "undefined" || !window.ethereum) return false;

    try {
      const provider = window.ethereum as unknown as Eip1193Provider;
      const chainId = await provider.request({ method: "eth_chainId" });
      const chainIdNumber = Number.parseInt(chainId, 16);
      const targetChainId = Number.parseInt(CELO_MAINNET.chainId, 16);

      // If already on Celo, network exists
      if (chainIdNumber === targetChainId) return true;

      // Try to switch - if it fails with 4902, network doesn't exist
      // We catch the error to check the code without actually switching
      try {
        await provider.request({
          method: "wallet_switchEthereumChain",
          params: [{ chainId: CELO_MAINNET.chainId }],
        });
        // If switch succeeds, network exists (but we're now on it)
        return true;
      } catch (error: any) {
        // 4902 means network not found/not added
        if (error.code === 4902) {
          return false;
        }
        // Other errors might mean network exists but switch was rejected
        // In that case, assume network exists
        return true;
      }
    } catch {
      return false;
    }
  };

  const fetchBalance = async (address: string): Promise<string> => {
    try {
      let provider: any = window.ethereum;
      if (!provider && (window as any).ethereum?.providers) {
        provider = (window as any).ethereum.providers?.[0] || (window as any).ethereum;
      }

      if (provider) {
        const balance = await provider.request({
          method: "eth_getBalance",
          params: [address, "latest"],
        });
        return (Number.parseInt(balance, 16) / 1e18).toFixed(4);
      }
    } catch (error) {
      console.error("Failed to fetch balance:", error);
    }
    return "0";
  };

  const checkOwnerStatus = async (address: string) => {
    try {
      const knownOwner = "0x3be7fbbdbc73fc4731d60ef09c4ba1a94dc58e41";
      setIsOwner(address.toLowerCase() === knownOwner.toLowerCase());
    } catch (error) {
      setIsOwner(false);
    }
  };

  // Sync AppKit connection state with wallet state
  useEffect(() => {
    if (appKitConnected && appKitAddress) {
      const chainIdNumber = appKitChainId ? Number(appKitChainId) : null;
      const targetChainId = Number.parseInt(CELO_MAINNET.chainId, 16);

      // Support both Celo and Fuse (122) so the dashboard doesn't disappear when claiming G$
      const isSupportedNetwork = chainIdNumber === targetChainId || chainIdNumber === 122;

      // Update wallet state from AppKit
      if (isSupportedNetwork) {
        // Fetch balance and update state
        fetchBalance(appKitAddress).then((balance) => {
          setWallet({
            address: appKitAddress,
            chainId: chainIdNumber,
            isConnected: true,
            balance: balance,
          });
          checkOwnerStatus(appKitAddress);
        });
      } else {
        // Connected to an unsupported network, but we still consider it "connected"
        // so the UI doesn't completely break, we just show 0 balance.
        setWallet({
          address: appKitAddress,
          chainId: chainIdNumber,
          isConnected: true, // Keep them connected so Dashboard renders
          balance: "0",
        });

        // Only show helpful message if it's completely unsupported
        toast({
          title: "Unsupported Network",
          description: "Please switch back to Celo Mainnet for SecureFlow functions.",
          variant: "destructive",
        });
      }
    } else {
      // Not connected via AppKit
      setWallet({
        address: null,
        chainId: null,
        isConnected: false,
        balance: "0",
      });
      setIsOwner(false);
    }
  }, [appKitConnected, appKitAddress, appKitChainId]);

  useEffect(() => {
    checkConnection();

    if (typeof window !== "undefined" && window.ethereum) {
      const provider = window.ethereum as unknown as Eip1193Provider;
      provider.on("accountsChanged", handleAccountsChanged);
      provider.on("chainChanged", handleChainChanged);
    }

    // Re-check connection periodically to catch AppKit connections
    // Check more frequently to catch AppKit connections quickly
    const interval = setInterval(() => {
      checkConnection();
    }, 1000); // Check every 1 second

    return () => {
      clearInterval(interval);
      if (typeof window !== "undefined" && window.ethereum) {
        const provider = window.ethereum as unknown as Eip1193Provider;
        provider.removeListener(
          "accountsChanged",
          handleAccountsChanged
        );
        provider.removeListener("chainChanged", handleChainChanged);
      }
    };
  }, []);

  const checkConnection = async () => {
    // If AppKit is connected, use that state (handled by the useEffect above)
    if (appKitConnected && appKitAddress) {
      return;
    }

    if (typeof window === "undefined") return;

    // Try to get provider - check window.ethereum first, then try AppKit's provider
    let provider: any = window.ethereum;

    // If no window.ethereum, try to get AppKit's provider
    if (!provider && (window as any).ethereum?.providers) {
      // Some wallets inject multiple providers
      provider =
        (window as any).ethereum.providers?.[0] || (window as any).ethereum;
    }

    if (!provider) {
      // If still no provider, check if we're connected via AppKit by checking for any injected provider
      const injectedProviders = (window as any).ethereum?.providers || [];
      if (injectedProviders.length > 0) {
        provider = injectedProviders[0];
      } else {
        return;
      }
    }

    try {
      const accounts = await provider.request({
        method: "eth_accounts",
      });

      if (accounts.length > 0) {
        const chainId = await provider.request({
          method: "eth_chainId",
        });
        const chainIdNumber = Number.parseInt(chainId, 16);
        const targetChainId = Number.parseInt(CELO_MAINNET.chainId, 16);

        // Support both Celo and Fuse (122)
        const isSupportedNetwork = chainIdNumber === targetChainId || chainIdNumber === 122;

        // Keep them connected regardless of network so the dashboard doesn't disappear
        if (!isSupportedNetwork) {
          // They are on a random network, we still render the dashboard
          // but don't fetch a Celo balance using this provider
          setWallet({
            address: accounts[0],
            chainId: chainIdNumber,
            isConnected: true,
            balance: "0",
          });
          return;
        }

        const balance = await provider.request({
          method: "eth_getBalance",
          params: [accounts[0], "latest"],
        });

        setWallet({
          address: accounts[0],
          chainId: targetChainId,
          isConnected: true,
          balance: (Number.parseInt(balance, 16) / 1e18).toFixed(4),
        });

        await checkOwnerStatus(accounts[0]);
      } else {
        // No accounts - ensure we're marked as disconnected
        if (wallet.isConnected) {
          setWallet({
            address: null,
            chainId: null,
            isConnected: false,
            balance: "0",
          });
        }
      }
    } catch (error) {
      // Silently fail - connection check will retry
    }
  };


  const handleAccountsChanged = (accounts: string[]) => {
    if (accounts.length === 0) {
      disconnectWallet();
    } else {
      setWallet((prev) => ({ ...prev, address: accounts[0] }));
      checkOwnerStatus(accounts[0]);
    }
  };

  const handleChainChanged = () => {
    window.location.reload();
  };

  const connectWallet = async () => {
    if (typeof window === "undefined" || !window.ethereum) {
      toast({
        title: "Wallet not found",
        description: "Please install MetaMask or another Web3 wallet",
        variant: "destructive",
      });
      return;
    }

    // Prevent duplicate connection requests
    if (isConnecting) {
      return;
    }

    // If AppKit is already connected, don't make another request
    if (appKitConnected && appKitAddress) {
      return;
    }

    setIsConnecting(true);

    try {
      const provider = window.ethereum as unknown as Eip1193Provider;
      const accounts = await provider.request({
        method: "eth_requestAccounts",
      });

      const chainId = await provider.request({ method: "eth_chainId" });
      const chainIdNumber = Number.parseInt(chainId, 16);
      const targetChainId = Number.parseInt(CELO_MAINNET.chainId, 16);

      // Automatically switch to Celo if not already on it
      if (chainIdNumber !== targetChainId) {
        toast({
          title: "Switching to Celo Mainnet",
          description: "Please approve the network switch or network addition",
        });

        try {
          // First, try to switch to Celo (this will automatically add it if missing)
          await switchToCelo();
          // Wait for network switch to complete
          await new Promise((resolve) => setTimeout(resolve, 1500));

          // Verify we're now on Celo
          const newChainId = await provider.request({
            method: "eth_chainId",
          });
          const newChainIdNumber = Number.parseInt(newChainId, 16);

          if (newChainIdNumber !== targetChainId) {
            // If still not on Celo, try to add it directly
            try {
              await provider.request({
                method: "wallet_addEthereumChain",
                params: [CELO_MAINNET],
              });
              toast({
                title: "Celo network added",
                description:
                  "Celo Mainnet has been added to your wallet. Please switch to it manually.",
              });
            } catch (addError: any) {
              console.error("Failed to add Celo network:", addError);
            }

            toast({
              title: "Network switch required",
              description: "Please switch to Celo Mainnet to use this app",
              variant: "destructive",
            });
            return;
          }
        } catch (switchError: any) {
          console.error("Failed to auto-switch network:", switchError);

          // If switch failed, try to add Celo network directly
          if (
            switchError.code === 4902 ||
            switchError.message?.includes("not been added")
          ) {
            try {
              await provider.request({
                method: "wallet_addEthereumChain",
                params: [CELO_MAINNET],
              });
              toast({
                title: "Celo network added",
                description:
                  "Celo Mainnet has been added. Please switch to it in your wallet.",
              });
            } catch (addError: any) {
              console.error("Failed to add Celo network:", addError);
              toast({
                title: "Network addition failed",
                description:
                  addError.message ||
                  "Failed to add Celo Mainnet. Please add it manually.",
                variant: "destructive",
              });
            }
          } else {
            toast({
              title: "Network switch required",
              description: "Please switch to Celo Mainnet manually to continue",
              variant: "destructive",
            });
          }
          return;
        }
      }

      const balance = await provider.request({
        method: "eth_getBalance",
        params: [accounts[0], "latest"],
      });

      setWallet({
        address: accounts[0],
        chainId: targetChainId,
        isConnected: true,
        balance: (Number.parseInt(balance, 16) / 1e18).toFixed(4),
      });

      await checkOwnerStatus(accounts[0]);

      toast({
        title: "Wallet connected",
        description: `Connected to Celo Mainnet - ${accounts[0].slice(
          0,
          6
        )}...${accounts[0].slice(-4)}`,
      });
    } catch (error: any) {
      // Check if error is related to network not being available
      const errorMessage = error.message?.toLowerCase() || "";
      const isNetworkError =
        error.code === 4902 ||
        errorMessage.includes("network") ||
        errorMessage.includes("chain") ||
        errorMessage.includes("not been added") ||
        errorMessage.includes("unrecognized chain");

      if (isNetworkError) {
        toast({
          title: "Celo Network Required",
          description: "Please add Celo Mainnet to your wallet to continue. Click 'Add Celo Network' button.",
          variant: "destructive",
        });
      } else {
        toast({
          title: "Connection failed",
          description: error.message || "Failed to connect wallet. Please try again.",
          variant: "destructive",
        });
      }
    } finally {
      setIsConnecting(false);
    }
  };

  const disconnectWallet = () => {
    setWallet({
      address: null,
      chainId: null,
      isConnected: false,
      balance: "0",
    });
    setIsOwner(false);
    toast({
      title: "Wallet disconnected",
      description: "Your wallet has been disconnected",
    });
  };

  const switchToCelo = async () => {
    if (typeof window === "undefined" || !window.ethereum) return;
    const provider = window.ethereum as unknown as Eip1193Provider;

    if (isSwitchingNetwork) {
      return;
    }

    const currentChainId = await provider.request({
      method: "eth_chainId",
    });
    const currentChainIdNumber = Number.parseInt(currentChainId, 16);
    const targetChainId = Number.parseInt(CELO_MAINNET.chainId, 16);

    if (currentChainIdNumber === targetChainId) {
      toast({
        title: "Already connected",
        description: "You're already on Celo mainnet",
      });
      return;
    }

    setIsSwitchingNetwork(true);

    try {
      await provider.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: CELO_MAINNET.chainId }],
      });

      toast({
        title: "Network switched",
        description: "Successfully switched to Celo mainnet",
      });
    } catch (error: any) {
      if (error.code === 4902) {
        try {
          await provider.request({
            method: "wallet_addEthereumChain",
            params: [CELO_MAINNET],
          });

          toast({
            title: "Network added",
            description: "Celo mainnet has been added to your wallet",
          });
        } catch (addError: any) {
          toast({
            title: "Network error",
            description: addError.message || "Failed to add Celo mainnet",
            variant: "destructive",
          });
        }
      } else if (error.code === 4001) {
        toast({
          title: "Request cancelled",
          description: "You cancelled the network switch",
        });
      } else {
        toast({
          title: "Switch failed",
          description: error.message || "Failed to switch network",
          variant: "destructive",
        });
      }
    } finally {
      setIsSwitchingNetwork(false);
    }
  };

  const addCeloNetwork = async (): Promise<boolean> => {
    if (typeof window === "undefined" || !window.ethereum) {
      toast({
        title: "Wallet not found",
        description: "Please install MetaMask or another Web3 wallet",
        variant: "destructive",
      });
      return false;
    }
    const provider = window.ethereum as unknown as Eip1193Provider;

    try {
      await provider.request({
        method: "wallet_addEthereumChain",
        params: [CELO_MAINNET],
      });

      toast({
        title: "Celo Network Added! 🎉",
        description: "Celo Mainnet has been added to your wallet. Please switch to it to continue.",
      });

      // After adding, try to switch to it
      setTimeout(async () => {
        try {
          await provider.request({
            method: "wallet_switchEthereumChain",
            params: [{ chainId: CELO_MAINNET.chainId }],
          });
        } catch (switchError) {
          // User might need to switch manually
          console.log("Auto-switch after add failed, user can switch manually");
        }
      }, 1000);

      return true;
    } catch (error: any) {
      console.error("Failed to add Celo network:", error);

      if (error.code === 4001) {
        toast({
          title: "Request cancelled",
          description: "You cancelled adding the Celo network",
          variant: "destructive",
        });
      } else {
        toast({
          title: "Failed to add network",
          description: error.message || "Please add Celo Mainnet manually in your wallet settings",
          variant: "destructive",
        });
      }
      return false;
    }
  };

  const switchToCeloTestnet = async () => {
    if (typeof window === "undefined" || !window.ethereum) return;
    const provider = window.ethereum as unknown as Eip1193Provider;

    if (isSwitchingNetwork) {
      return;
    }

    const currentChainId = await provider.request({
      method: "eth_chainId",
    });
    const currentChainIdNumber = Number.parseInt(currentChainId, 16);
    const targetChainId = Number.parseInt(CELO_TESTNET.chainId, 16);

    if (currentChainIdNumber === targetChainId) {
      toast({
        title: "Already connected",
        description: "You're already on Celo Alfajores testnet",
      });
      return;
    }

    setIsSwitchingNetwork(true);

    try {
      await provider.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: CELO_TESTNET.chainId }],
      });

      toast({
        title: "Network switched",
        description: "Successfully switched to Celo Alfajores testnet",
      });
    } catch (error: any) {
      if (error.code === 4902) {
        try {
          await provider.request({
            method: "wallet_addEthereumChain",
            params: [CELO_TESTNET],
          });

          toast({
            title: "Network added",
            description: "Celo Alfajores testnet has been added to your wallet",
          });
        } catch (addError: any) {
          toast({
            title: "Network error",
            description:
              addError.message || "Failed to add Celo Alfajores testnet",
            variant: "destructive",
          });
        }
      } else if (error.code === 4001) {
        toast({
          title: "Request cancelled",
          description: "You cancelled the network switch",
        });
      } else {
        toast({
          title: "Switch failed",
          description: error.message || "Failed to switch network",
          variant: "destructive",
        });
      }
    } finally {
      setIsSwitchingNetwork(false);
    }
  };

  const getContract = (address: string, abi: any) => {
    if (typeof window === "undefined" || !window.ethereum) return null;
    // Normalize address to a valid checksum to avoid INVALID_ARGUMENT errors
    let targetAddress = address;
    try {
      targetAddress = ethers.getAddress(address.toLowerCase());
    } catch { }

    return {
      async call(method: string, ...args: any[]) {
        try {
          // Try using wallet provider first (more reliable)
          if (typeof window !== "undefined" && window.ethereum) {
            try {
              const walletProvider = new ethers.BrowserProvider(
                window.ethereum as unknown as Eip1193Provider
              );
              const contract = new ethers.Contract(
                targetAddress,
                abi,
                walletProvider
              );
              const result = await contract[method](...args);
              return result;
            } catch (walletError) {
              console.warn(
                "Wallet provider call failed, trying RPC:",
                walletError
              );
            }
          }

          // Fallback to direct RPC connection
          const provider = new ethers.JsonRpcProvider(CELO_MAINNET.rpcUrls[0]);
          const contract = new ethers.Contract(targetAddress, abi, provider);

          // Call the contract method directly
          const result = await contract[method](...args);
          return result;
        } catch (error) {
          console.error(`Contract call error for ${method}:`, error);
          throw error;
        }
      },
      async send(method: string, value: string = "0x0", ...args: any[]) {
        try {
          const provider = window.ethereum as unknown as Eip1193Provider;

          // First, ensure we're on the correct network
          const currentChainId = await provider.request({
            method: "eth_chainId",
          });

          // Check if we're on Celo Mainnet
          const targetChainId = CELO_MAINNET.chainId;

          // Convert to lowercase for case-insensitive comparison
          const currentChainIdLower = currentChainId.toLowerCase();
          const targetChainIdLower = targetChainId.toLowerCase();

          if (currentChainIdLower !== targetChainIdLower) {
            throw new Error(
              `Wrong network! Please switch to Celo Mainnet (Chain ID: ${targetChainId}). Current: ${currentChainId}`
            );
          }

          // Additional check: verify we can connect to Celo RPC
          try {
            const celoProvider = new ethers.JsonRpcProvider(
              CELO_MAINNET.rpcUrls[0]
            );
            await celoProvider.getBlockNumber(); // Test connection to Celo
          } catch (celoError) {
            throw new Error(
              `Network validation failed. Please ensure you're connected to Celo Mainnet (Chain ID: 42220).`
            );
          }

          const data = encodeFunction(abi, method, args);

          // Estimate gas for the transaction with optimized limits
          let gasLimit = "0x80000"; // Reduced default fallback (524,288 gas)

          // Force higher gas limits for specific functions that need it
          if (method === "approve") {
            gasLimit = "0x186A0"; // 100,000 gas - sufficient for GoodDollar ERC20 approve
          } else {
            try {
              const estimatedGas = await provider.request({
                method: "eth_estimateGas",
                params: [
                  {
                    from: wallet.address,
                    to: targetAddress,
                    data,
                    value:
                      value !== "0x0" && value !== "no-value" ? value : "0x0",
                  },
                ],
              });
              // Add only 10% buffer to estimated gas (reduced from 20%)
              const gasWithBuffer = Math.floor(Number(estimatedGas) * 1.1);
              gasLimit = `0x${gasWithBuffer.toString(16)}`;
            } catch (gasError) {
              // Use much lower, function-specific gas limits
              if (method === "unpause" || method === "pause") {
                gasLimit = "0x20000"; // 131,072 gas - very low for simple functions
              } else if (
                method === "submitMilestone" ||
                method === "approveMilestone" ||
                method === "rejectMilestone" ||
                method === "disputeMilestone"
              ) {
                gasLimit = "0x30000"; // 196,608 gas - reduced for milestone functions
              } else if (
                method === "createEscrow" ||
                method === "createEscrowNative"
              ) {
                gasLimit = "0x60000"; // 393,216 gas - optimized for escrow creation
              }
            }
          }

          const txParams: any = {
            from: wallet.address,
            to: targetAddress,
            data,
            gas: gasLimit,
          };

          // Only add value field if it's not "0x0" or "no-value" (for native token transactions)
          if (value !== "0x0" && value !== "no-value") {
            txParams.value = value;
          }

          const txHash = await provider.request({
            method: "eth_sendTransaction",
            params: [txParams],
          });
          return txHash;
        } catch (error) {
          throw error;
        }
      },
      async owner() {
        return "0x3be7fbbdbc73fc4731d60ef09c4ba1a94dc58e41";
      },
    };
  };

  const encodeFunction = (abi: any, method: string, args: any[]) => {
    try {
      // Create a proper interface from the ABI
      const iface = new ethers.Interface(abi);

      // Encode the function call with proper parameters
      const encodedData = iface.encodeFunctionData(method, args);

      return encodedData;
    } catch (error) {
      // Fallback to basic encoding for common functions
      if (method === "approve") {
        // approve(address,uint256) selector
        return (
          "0x095ea7b3" +
          "0000000000000000000000000000000000000000000000000000000000000000".repeat(
            2
          )
        );
      } else if (method === "createEscrow") {
        // createEscrow function selector (this needs to be calculated from the actual function signature)
        return (
          "0x" +
          "12345678" +
          "0000000000000000000000000000000000000000000000000000000000000000".repeat(
            8
          )
        );
      } else if (method === "createEscrowNative") {
        // createEscrowNative function selector
        return (
          "0x" +
          "87654321" +
          "0000000000000000000000000000000000000000000000000000000000000000".repeat(
            7
          )
        );
      }

      return "0x";
    }
  };

  return (
    <Web3Context.Provider
      value={{
        wallet,
        connectWallet,
        disconnectWallet,
        switchToCelo,
        switchToCeloTestnet,
        addCeloNetwork,
        getContract,
        isOwner,
      }}
    >
      {children}
    </Web3Context.Provider>
  );
}

export function useWeb3() {
  const context = useContext(Web3Context);
  if (context === undefined) {
    throw new Error("useWeb3 must be used within a Web3Provider");
  }
  return context;
}

