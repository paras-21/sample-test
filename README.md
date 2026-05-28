# mp — x402 Paid Text Endpoint

A minimal x402-enabled Express API that returns text data after payment.
Auto-indexed on [agentic.market](https://agentic.market) via the Bazaar extension.

## Setup

```bash
npm install
npm start
```

## Endpoint

| Method | Path | Price | Network |
|--------|------|-------|---------|
| GET | `/api/base/text-data` | $0.001 | Base Sepolia |

## Validate

Once deployed with a public URL, update `HOST` in `.env` then validate at:
https://agentic.market/validate

## Notes

- Uses CDP facilitator: `https://api.cdp.coinbase.com/platform/v2/x402/facilitator`
- Payment token: USDC on Base Sepolia (`0x036CbD53842c5426634e7929541eC2318f3dCF7e`)
- `payTo`: `0x3b9B597Add127eadf6D0d7cd20C3aaaC4ee94a96`
