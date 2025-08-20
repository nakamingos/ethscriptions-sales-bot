import { Market } from '@/models/evm';

import * as signatures from '@/constants/signatures';

export const markets: Market[] = [
  {
    marketplaceName: 'Ethscriptions.com',
    marketplaceUrl: 'https://ethscriptions.com',
    address: '0xD729A94d6366a4fEac4A6869C8b3573cEe4701A9' as `0x${string}`,
    events: [
      {
        signature: signatures.ethscriptionsDotComSaleSignature,
        name: 'EthscriptionPurchased',
        hashIdTarget: 'ethscriptionId',
        valueTarget: 'price',
        sellerTarget: 'seller',
        buyerTarget: 'buyer',
      }
    ]
  },
  {
    marketplaceName: 'Etch Market',
    marketplaceUrl: 'https://etch.market',
    address: '0x57b8792c775D34Aa96092400983c3e112fCbC296' as `0x${string}`,
    events: [
      {
        signature: signatures.etchSaleSignature,
        name: 'EthscriptionOrderExecuted',
        hashIdTarget: 'ethscriptionId',
        valueTarget: 'price',
        sellerTarget: 'seller',
        buyerTarget: 'buyer',
      }
    ]
  },
  {
    marketplaceName: 'Ordex',
    marketplaceUrl: 'https://ordex.io',
    address: '0xC33F8610941bE56fB0d84E25894C0d928CC97ddE' as `0x${string}`,
    events: [
      {
        signature: signatures.ordexSaleSignature,
        name: 'Match',
        hashIdTarget: '_ethscriptionId',
        valueTarget: 'newLeftFill',
        sellerTarget: '_from',
        buyerTarget: '_to',
        eventTrigger: {
          signature: signatures.ordexInternalTransferSignature,
          address: '0xC89C2E6FE008592D6a787eFd02DB7fDB8eA64020',
        }
      }
    ]
  },
  {
    marketplaceName: 'EtherPhunks Market',
    marketplaceUrl: 'https://etherphunks.eth.limo',
    address: '0xD3418772623Be1a3cc6B6D45CB46420CEdD9154a' as `0x${string}`,
    events: [
      {
        signature: signatures.etherPhunksSaleSignature,
        name: 'PhunkBought',
        hashIdTarget: 'phunkId',
        valueTarget: 'value',
        sellerTarget: 'fromAddress',
        buyerTarget: 'toAddress',
      }
    ]
  },
  {
    marketplaceName: 'MemeScribe',
    marketplaceUrl: 'https://memescribe.app',
    address: '0x0e720B468737664Ec57bb545F798F71bC57605c1' as `0x${string}`,
    events: [
      {
        signature: signatures.memeScribeSaleSignature,
        name: 'EthscriptionPurchased',
        hashIdTarget: 'ethscriptionId',
        valueTarget: 'price',
        sellerTarget: 'seller',
        buyerTarget: 'buyer',
      }
    ]
  },
  {
    marketplaceName: 'ittybits Marketplace',
    marketplaceUrl: 'https://ittybits.xyz',
    address: '0xa8Ee53258865c55a521727127D8a64c414163D36' as `0x${string}`,
    events: [
      {
        signature: signatures.ittybitsSaleSignature,
        name: 'IttybitBought',
        hashIdTarget: 'ittybitId',
        valueTarget: 'value',
        sellerTarget: 'fromAddress',
        buyerTarget: 'toAddress',
      }
    ]
  }
];

