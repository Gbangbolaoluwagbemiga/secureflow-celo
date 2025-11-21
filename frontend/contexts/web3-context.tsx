"use client";

import {
  createContext,
  useContext,
  useState,
  useEffect,
  type ReactNode,
} from "react";
import {
  CELO_MAINNET,
  CELO_TESTNET,
  CONTRACTS,
} from "@/lib/web3/config";
import type { WalletState } from "@/lib/web3/types";
import { useToast } from "@/hooks/use-toast";
import { ethers } from "ethers";

interface Web3ContextType {
  wallet: WalletState;
  connectWallet: () => Promise<void>;
  disconnectWallet: () => void;
  switchToCelo: () => Promise<void>;
  switchToCeloTestnet: () => Promise<void>;
  getContract: (address: string, abi: any) => any;
  isOwner: boolean;
}

const Web3Context = createContext<Web3ContextType | undefined>(undefined);

export function Web3Provider({ children }: { children: ReactNode }) {
  const { toast } = useToast();
  const [wallet, setWallet] = useState<WalletState>({
    address: null,
    chainId: null,
    isConnected: false,
    balance: "0",
  });
  const [isOwner, setIsOwner] = useState(false);
  const [isSwitchingNetwork, setIsSwitchingNetwork] = useState(false);

  useEffect(() => {
    checkConnection();

    if (typeof window !== "undefined" && window.ethereum) {
      window.ethereum.on("accountsChanged", handleAccountsChanged);
      window.ethereum.on("chainChanged", handleChainChanged);
    }

    // Re-check connection periodically to catch AppKit connections
    // Only poll if not connected to avoid unnecessary checks
    const interval = setInterval(() => {
      if (!wallet.isConnected) {
        checkConnection();
      }
    }, 2000); // Check every 2 seconds if not connected

    return () => {
      clearInterval(interval);
      if (typeof window !== "undefined" && window.ethereum) {
        window.ethereum.removeListener(
          "accountsChanged",
          handleAccountsChanged
        );
        window.ethereum.removeListener("chainChanged", handleChainChanged);
      }
    };
  }, []);

  const checkConnection = async () => {
    if (typeof window === "undefined" || !window.ethereum) return;

    try {
      const accounts = await window.ethereum.request({
        method: "eth_accounts",
      });
      if (accounts.length > 0) {
        const chainId = await window.ethereum.request({
          method: "eth_chainId",
        });
        const chainIdNumber = Number.parseInt(chainId, 16);
        const targetChainId = Number.parseInt(CELO_MAINNET.chainId, 16);

        // If on wrong network, try to switch automatically (but only once per session)
        if (chainIdNumber !== targetChainId) {
          // Don't auto-switch in checkConnection to avoid spam
          // User should manually connect via connectWallet which will handle the switch
          setWallet({
            address: accounts[0],
            chainId: chainIdNumber,
            isConnected: false, // Mark as not connected if on wrong network
            balance: "0",
          });
          return;
        }

        const balance = await window.ethereum.request({
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
      }
    } catch (error) {}
  };

  const checkOwnerStatus = async (address: string) => {
    try {
      const knownOwner = "0x3be7fbbdbc73fc4731d60ef09c4ba1a94dc58e41";

      setIsOwner(address.toLowerCase() === knownOwner.toLowerCase());
    } catch (error) {
      setIsOwner(false);
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

    try {
      const accounts = await window.ethereum.request({
        method: "eth_requestAccounts",
      });

      const chainId = await window.ethereum.request({ method: "eth_chainId" });
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
          const newChainId = await window.ethereum.request({
            method: "eth_chainId",
          });
          const newChainIdNumber = Number.parseInt(newChainId, 16);

          if (newChainIdNumber !== targetChainId) {
            // If still not on Celo, try to add it directly
            try {
              await window.ethereum.request({
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
              await window.ethereum.request({
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

      const balance = await window.ethereum.request({
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
      toast({
        title: "Connection failed",
        description: error.message || "Failed to connect wallet",
        variant: "destructive",
      });
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

    if (isSwitchingNetwork) {
      return;
    }

    const currentChainId = await window.ethereum.request({
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
      await window.ethereum.request({
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
          await window.ethereum.request({
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

  const switchToCeloTestnet = async () => {
    if (typeof window === "undefined" || !window.ethereum) return;

    if (isSwitchingNetwork) {
      return;
    }

    const currentChainId = await window.ethereum.request({
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

    try{
      await window.ethereum.request({
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
          await window.ethereum.request({
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
            description: addError.message || "Failed to add Celo Alfajores testnet",
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
    } catch {}

    return {
      async call(method: string, ...args: any[]) {
        try {
          // Try using wallet provider first (more reliable)
          if (typeof window !== "undefined" && window.ethereum) {
            try {
              const walletProvider = new ethers.BrowserProvider(
                window.ethereum
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
          // First, ensure we're on the correct network
          const currentChainId = await window.ethereum.request({
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
            gasLimit = "0xc350"; // 50,000 gas - force higher limit for ERC20 approve
          } else {
            try {
              const estimatedGas = await window.ethereum.request({
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

          const txHash = await window.ethereum.request({
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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
declare global {
  interface Window {
    ethereum?: any;
  }
}
