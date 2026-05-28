/**
 * trigger-payment.js
 * Acts as an x402 buyer — signs a USDC payment and hits the paid endpoint.
 * Run once to trigger Bazaar indexing.
 *
 * Usage:
 *   node trigger-payment.js
 */

import { createWalletClient, createPublicClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { baseSepolia } from "viem/chains";
import { wrapFetchWithPaymentFromConfig } from "@x402/fetch";
import { ExactEvmScheme } from "@x402/evm/exact/client";
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

// ---------------------------------------------------------------------------
// Load .env
// ---------------------------------------------------------------------------
const __dirname = dirname(fileURLToPath(import.meta.url));
try {
  const envFile = readFileSync(resolve(__dirname, ".env"), "utf8");
  for (const line of envFile.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const idx = trimmed.indexOf("=");
    if (idx === -1) continue;
    const key = trimmed.slice(0, idx).trim();
    const val = trimmed.slice(idx + 1).trim();
    if (!process.env[key]) process.env[key] = val;
  }
} catch { /* ignore */ }

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------
const PRIVATE_KEY = process.env.BUYER_PRIVATE_KEY;
const ENDPOINT = "https://sample-test-c3fb.onrender.com/api/base/text-data";
const NETWORK = "eip155:84532"; // Base Sepolia
const USDC = "0x036CbD53842c5426634e7929541eC2318f3dCF7e";

if (!PRIVATE_KEY) {
  console.error("ERROR: BUYER_PRIVATE_KEY not set in .env");
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Set up viem clients
// ---------------------------------------------------------------------------
const account = privateKeyToAccount(PRIVATE_KEY);

const publicClient = createPublicClient({
  chain: baseSepolia,
  transport: http(),
});

const walletClient = createWalletClient({
  account,
  chain: baseSepolia,
  transport: http(),
});

console.log(`Buyer wallet : ${account.address}`);
console.log(`Endpoint     : ${ENDPOINT}`);
console.log(`\nChecking USDC balance...`);

// Check balance
const balance = await publicClient.readContract({
  address: USDC,
  abi: [{
    name: "balanceOf",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ type: "uint256" }],
  }],
  functionName: "balanceOf",
  args: [account.address],
});

const usdcBalance = Number(balance) / 1e6;
console.log(`USDC balance : $${usdcBalance.toFixed(4)}`);

if (usdcBalance < 0.001) {
  console.error(`\nInsufficient USDC. Need at least $0.001.`);
  console.error(`Get free Base Sepolia USDC at: https://faucet.circle.com`);
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Build signer interface expected by ExactEvmScheme
// ---------------------------------------------------------------------------
const signer = {
  address: account.address,
  signTypedData: (typedData) =>
    walletClient.signTypedData({
      account,
      domain: typedData.domain,
      types: typedData.types,
      primaryType: typedData.primaryType,
      message: typedData.message,
    }),
};

// ---------------------------------------------------------------------------
// Wrap fetch with x402 payment logic
// ---------------------------------------------------------------------------
const fetchWithPayment = wrapFetchWithPaymentFromConfig(fetch, {
  schemes: [
    {
      x402Version: 2,
      network: NETWORK,
      client: new ExactEvmScheme(signer, { publicClient }),
    },
  ],
});

// ---------------------------------------------------------------------------
// Make the paid request
// ---------------------------------------------------------------------------
console.log(`\nMaking payment and calling endpoint...`);

try {
  const response = await fetchWithPayment(ENDPOINT);

  if (!response.ok) {
    const text = await response.text();
    const hdr = response.headers.get("payment-required");
    console.error(`Request failed (${response.status}): ${text}`);
    if (hdr) console.error(`payment-required header present — payment was not submitted`);
    process.exit(1);
  }

  const data = await response.json();
  console.log(`\n✅ Payment successful! Response:`);
  console.log(JSON.stringify(data, null, 2));
  console.log(`\nYour endpoint will appear in the Bazaar within a few minutes.`);
  console.log(`Check: https://agentic.market`);
} catch (err) {
  console.error(`\nError: ${err.message}`);
  if (err.cause) console.error(`Cause: ${err.cause}`);
  console.error(err.stack);
  process.exit(1);
}
