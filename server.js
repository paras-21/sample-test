import express from "express";
import { paymentMiddleware, x402ResourceServer } from "@x402/express";
import { HTTPFacilitatorClient } from "@x402/core/server";
import { ExactEvmScheme } from "@x402/evm/exact/server";
import { declareDiscoveryExtension } from "@x402/extensions";
import { generateJwt } from "@coinbase/cdp-sdk/auth";
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

// ---------------------------------------------------------------------------
// Load .env manually (no dotenv dependency needed)
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
} catch {
  // .env not found — rely on environment variables already set
}

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------
const PORT = process.env.PORT || 4021;
const PAY_TO = "0x3b9B597Add127eadf6D0d7cd20C3aaaC4ee94a96";
const NETWORK = "eip155:84532"; // Base Sepolia
const PRICE = "$0.001";

const CDP_KEY_ID = process.env.CDP_API_KEY_NAME;
const CDP_KEY_SECRET = process.env.CDP_API_KEY_PRIVATE_KEY;
const FACILITATOR_URL = "https://api.cdp.coinbase.com/platform/v2/x402";

if (!CDP_KEY_ID || !CDP_KEY_SECRET) {
  console.error("ERROR: CDP_API_KEY_NAME and CDP_API_KEY_PRIVATE_KEY must be set in .env");
  process.exit(1);
}

// ---------------------------------------------------------------------------
// JWT auth header factory for CDP facilitator
// CDP requires a fresh JWT (valid 2 min) per request, signed with Ed25519 key
// ---------------------------------------------------------------------------
async function makeCdpAuthHeaders(method, path) {
  const url = new URL(FACILITATOR_URL);
  const token = await generateJwt({
    apiKeyId: CDP_KEY_ID,
    apiKeySecret: CDP_KEY_SECRET,
    requestMethod: method,
    requestHost: url.host,
    requestPath: `${url.pathname}/${path}`,
  });
  return { Authorization: `Bearer ${token}` };
}

// ---------------------------------------------------------------------------
// Example response — shown to Bazaar crawler before payment
// ---------------------------------------------------------------------------
const EXAMPLE_RESPONSE = {
  message: "Hello from the paid text endpoint",
  data: "This is sample text data returned after payment.",
  timestamp: "2026-05-28T00:00:00.000Z",
};

// ---------------------------------------------------------------------------
// Resource server — CDP facilitator + EVM exact scheme
// ---------------------------------------------------------------------------
const facilitatorClient = new HTTPFacilitatorClient({
  url: FACILITATOR_URL,
  createAuthHeaders: async () => ({
    verify:    await makeCdpAuthHeaders("POST", "verify"),
    settle:    await makeCdpAuthHeaders("POST", "settle"),
    supported: await makeCdpAuthHeaders("GET",  "supported"),
  }),
});

const resourceServer = new x402ResourceServer(facilitatorClient).register(
  NETWORK,
  new ExactEvmScheme()
);

// ---------------------------------------------------------------------------
// Express app
// ---------------------------------------------------------------------------
const app = express();
app.use(express.json());

// ---------------------------------------------------------------------------
// x402 payment middleware
// ---------------------------------------------------------------------------
app.use(
  paymentMiddleware(
    {
      "GET /api/base/text-data": {
        accepts: {
          scheme: "exact",
          price: PRICE,
          network: NETWORK,
          payTo: PAY_TO,
          maxTimeoutSeconds: 300,
        },
        description: "Returns a text data payload after payment via x402.",
        extensions: {
          ...declareDiscoveryExtension({
            method: "GET",
            output: {
              example: EXAMPLE_RESPONSE,
              schema: {
                properties: {
                  message: { type: "string" },
                  data: { type: "string" },
                  timestamp: { type: "string", format: "date-time" },
                },
              },
            },
          }),
        },
      },
    },
    resourceServer
  )
);

// ---------------------------------------------------------------------------
// Protected route — only reached after valid payment
// ---------------------------------------------------------------------------
app.get("/api/base/text-data", (req, res) => {
  res.json({
    message: "Hello from the paid text endpoint",
    data: "This is text data you paid for. Extend this with your real content.",
    timestamp: new Date().toISOString(),
  });
});

// ---------------------------------------------------------------------------
// Health check — free, no payment required
// ---------------------------------------------------------------------------
app.get("/health", (req, res) => {
  res.json({ status: "ok", version: "1.0.0" });
});

app.listen(PORT, () => {
  console.log(`\nServer running on http://localhost:${PORT}`);
  console.log(`Paid endpoint : GET http://localhost:${PORT}/api/base/text-data`);
  console.log(`Health check  : GET http://localhost:${PORT}/health`);
  console.log(`\nNetwork  : Base Sepolia (${NETWORK})`);
  console.log(`Price    : ${PRICE} USDC`);
  console.log(`Pay to   : ${PAY_TO}`);
});
