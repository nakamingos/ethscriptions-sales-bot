# Ethscriptions Sales Bot

A NestJS-based bot that monitors Ethereum blockchain events for Ethscription sales across multiple marketplaces, generates notification images, and posts updates to Twitter.

## Features

👍 **Multi-Marketplace Monitoring**: Tracks sales across major Ethscription marketplaces including:
- Ethscriptions.com
- MemeScribe
- Etch Market
- EtherPhunks Market
- Ordex

👍 **Dynamic Image Generation**: Creates custom notification images for sales featuring:
- Collection branding
- Item preview
- Sale details
- Configurable layouts

👍 **Twitter Integration**: Automatically posts sale notifications to Twitter with:
- Custom formatted messages
- Generated images
- Transaction links
- Price in ETH and USD

👍 **Real-time Price Data**: Maintains current ETH/USD price through CoinGecko API

## Prerequisites

- Node.js
- Yarn
- Ethereum RPC endpoint
- Twitter account credentials (if using Twitter integration)

## Installation

Choose your preferred package manager:

```bash
# Using yarn
yarn install

# Using npm
npm install

# Using pnpm
pnpm install
```

## Configuration

Create a `.env` file based on the provided `.env.example`:

```env
NODE_ENV=development
IMAGE_GEN_ENABLED=1

# RPC
RPC_URL=your_ethereum_rpc_url

# Twitter
TWITTER_ENABLED=0
TWITTER_USERNAME=your_twitter_username
TWITTER_PASSWORD=your_twitter_password
TWITTER_EMAIL=your_twitter_email
```

## Running the App

```bash
# Development
yarn run start

# Watch mode
yarn run start:dev

# Production mode
yarn run start:prod
```

## Adding New Collections

Add collection metadata JSON URLs to `src/constants/collections.ts`:

```typescript
export const collections = [
  "https://raw.githubusercontent.com/example/collection/main/metadata.json"
];
```

Collection metadata should follow either the standard format or Emblem Vault format.

## Market Configuration

Markets are configured in `src/constants/markets.ts`. Each market definition includes:
- Marketplace name and URL
- Contract address
- Event signatures and parameter mapping

## Architecture

- **Services**
  - `AppService`: Main application logic and event handling
  - `EvmService`: EVM interaction
  - `ImageService`: Sale notification image generation
  - `TwitterService`: Eliza Twitter integration
  - `CollectionService`: Collection metadata management
  - `DataService`: External data fetching (prices, etc.)
  - `UtilService`: Shared utility functions

## License

[Creative Commons Zero](LICENSE)

## Contributing

1. Fork the repository
2. Create your feature branch
3. Commit your changes
4. Push to the branch
5. Create a new Pull Request

### Twitter Integration

This project uses [agent-twitter-client](https://github.com/elizaOS/agent-twitter-client) (Eliza) for Twitter automation. This client allows posting to Twitter without requiring API keys, making it easier to set up and maintain.