import { Injectable, Logger, OnModuleInit } from '@nestjs/common';

import { AbiEvent, decodeEventLog, formatUnits, Log, parseAbiItem, toHex } from 'viem';

import { markets } from '@/constants/markets';

import { EvmService } from '@/services/evm.service';
import { DataService } from '@/services/data.service';
import { TwitterService } from '@/services/twitter.service';
import { ImageService } from '@/services/image.service';
import { CollectionService } from '@/services/collection.service';
import { UtilService } from '@/services/util.service';

import { NotificationMessage } from '@/models/notification';
import { Market, MarketplaceEvent } from '@/models/evm';

/**
 * Main service for initializing and running the application
 */
@Injectable()
export class AppService implements OnModuleInit {
  private eventQueue: Promise<void> = Promise.resolve();
  private readonly backfillTimestampFormatter = new Intl.DateTimeFormat('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
    month: 'short',
    day: '2-digit',
    year: 'numeric',
  });

  constructor(
    private readonly evmSvc: EvmService,
    private readonly dataSvc: DataService,
    private readonly twitterSvc: TwitterService,
    private readonly imageSvc: ImageService,
    private readonly collectionSvc: CollectionService,
    private readonly utilSvc: UtilService
  ) {}

  onModuleInit() {
    this.watchEvents();

    setTimeout(() => {
      // Test with history or range
      if (Number(process.env.TEST_WITH_HISTORY)) {
        this.testWithHistory();
      } else if (process.env.TEST_WITH_RANGE?.split(',').length === 2) {
        this.testWithRange();
      }
    }, 5000);
  }

  /**
   * Sets up event watchers for all configured marketplace events
   * 
   * Iterates through each marketplace and its associated events, creating event listeners
   * that will trigger when sales occur.
   */
  async watchEvents() {
    // Iterate markets
    for (const market of markets) {
      // Iterate events for each market
      for (const marketEvent of market.events) {
        // Example usage
        const eventEmitter = this.evmSvc.watchEvent(market, marketEvent);
        Logger.log(`Watching event <${marketEvent.name}> on ${market.marketplaceName}`, 'AppService');
        eventEmitter.on('event', (logs: Log[]) => {
          this.handleEvent(market, marketEvent, logs).catch((error) => {
            Logger.error(error, undefined, 'AppService');
          });
        });
      }
    }
  }

  private enqueueEventHandling(
    market: Market,
    marketEvent: MarketplaceEvent,
    logs: Log[],
    options?: { pacedPost?: boolean },
  ): Promise<void> {
    const queuedTask = this.eventQueue.then(() => this.handleEvent(market, marketEvent, logs, options));
    this.eventQueue = queuedTask.catch((error) => {
      Logger.error(error, undefined, 'AppService');
    });
    return queuedTask;
  }

  private sortLogsInChainOrder(
    logs: Array<{ log: any; market: Market; event: MarketplaceEvent }>,
  ) {
    return [...logs].sort((a, b) => {
      const blockDiff = this.compareBigInt(a.log.blockNumber, b.log.blockNumber);
      if (blockDiff !== 0) return blockDiff;

      const txDiff = this.compareNumber(a.log.transactionIndex, b.log.transactionIndex);
      if (txDiff !== 0) return txDiff;

      return this.compareNumber(a.log.logIndex, b.log.logIndex);
    });
  }

  private compareBigInt(a?: bigint, b?: bigint): number {
    const left = a ?? BigInt(0);
    const right = b ?? BigInt(0);
    if (left === right) return 0;
    return left < right ? -1 : 1;
  }

  private compareNumber(a?: number, b?: number): number {
    const left = a ?? 0;
    const right = b ?? 0;
    return left - right;
  }

  private formatBackfillTimestamp(unixTimestampSeconds: number): string {
    const parts = this.backfillTimestampFormatter.formatToParts(
      new Date(unixTimestampSeconds * 1000),
    );

    const values = Object.fromEntries(
      parts
        .filter((part) => part.type !== 'literal')
        .map((part) => [part.type, part.value]),
    );

    return `on ${values.month} ${values.day}, ${values.year} • ${values.hour}:${values.minute} ${values.dayPeriod}`;
  }

  private getSaleLink(
    market: Market,
    hashId: string,
    txHash: `0x${string}`,
  ): string {
    if (market.saleLinkTemplate) {
      return market.saleLinkTemplate.replace('<ethscription_ID>', hashId);
    }

    if (market.marketplaceUrl) {
      return market.marketplaceUrl;
    }

    return `https://etherscan.io/tx/${txHash}`;
  }

  /**
   * Handles marketplace events by processing sale logs and fetching inscription data
   * 
   * @param market - The marketplace where the sale occurred (e.g. Ethscriptions.com, Etch Market)
   * @param marketEvent - Details about the specific event type being handled
   * @param logs - Array of event logs containing sale data
   */
  async handleEvent(
    market: Market, 
    marketEvent: MarketplaceEvent, 
    logs: Log[],
    options?: { pacedPost?: boolean }
  ) {
    // Logger.log(`New event: ${market.marketplaceName} -- ${marketEvent.name}`, 'AppService');

    if (!logs.length) return;

    const eventType = parseAbiItem(marketEvent.signature) as AbiEvent;
    const log = logs[0] as (Log<bigint, number, boolean, typeof eventType> | undefined);
    if (!log) return;

    const txHash = log.transactionHash;
    
    // Extract hashId and handle different formats
    let hashId = log.args[marketEvent.hashIdTarget];
    if (typeof hashId === 'bigint') {
      hashId = toHex(hashId);
      // Ensure hashId is bytes32 (32 bytes = 64 hex chars + '0x' prefix = 66 chars)
      if (hashId.length < 66) {
        hashId = hashId.replace('0x', '0x' + '0'.repeat(66 - hashId.length));
      }
    }
    const value = formatUnits(log.args[marketEvent.valueTarget], 18);
    const seller = log.args[marketEvent.sellerTarget];
    const buyer = log.args[marketEvent.buyerTarget];
    const blockTimestamp = options?.pacedPost
      ? await this.evmSvc.getBlockTimestamp(log.blockNumber)
      : null;

    // Check if it's supported
    const collectionMetadata = await this.collectionSvc.getSupportedInscription(hashId);
    if (!collectionMetadata) {
      Logger.debug(`Inscription ${hashId} is not from a supported collection`, 'AppService');
      return;
    }

    // Get the collection image
    if (collectionMetadata.collectionImageHash) {
      const collectionImage = await this.evmSvc.getInscriptionImageFromHashId(collectionMetadata.collectionImageHash);
      if (collectionImage) collectionMetadata.collectionImageUri = collectionImage;
    }

    Logger.log(`New event from supported collection: ${collectionMetadata.collectionName}`, 'AppService');

    // Get the inscription data
    const inscriptionImageUri = await this.evmSvc.getInscriptionImageFromHashId(hashId);
    if (!inscriptionImageUri) return;

    // Generate the image
    const imageAttachment = await this.imageSvc.generate(hashId, value, txHash, inscriptionImageUri, collectionMetadata);

    const [buyerEns, sellerEns] = await Promise.all([
      this.evmSvc.getEnsName(buyer),
      this.evmSvc.getEnsName(seller),
    ]);

    // Create the notification message
    const priceLine = options?.pacedPost && blockTimestamp
      ? `For: ${value} ETH ($${this.utilSvc.formatCash(Number(value) * this.dataSvc.usdPrice)}) ${this.formatBackfillTimestamp(blockTimestamp)}`
      : `For: ${value} ETH ($${this.utilSvc.formatCash(Number(value) * this.dataSvc.usdPrice)})`;
    const notificationMessage: NotificationMessage = {
      title: `${collectionMetadata.itemName} was SOLD!`,
      message: `${priceLine}\n\nSeller: ${sellerEns || this.utilSvc.formatAddress(seller)}\nBuyer: ${buyerEns || this.utilSvc.formatAddress(buyer)}`,
      link: this.getSaleLink(market, hashId, txHash),
      imageBuffer: imageAttachment,
      filename: `${hashId}.png`,
    };

    // Post to twitter
    const twitterAccount = collectionMetadata.twitterAccount; // Retrieve the Twitter account
    if (!twitterAccount) {
      Logger.error(`No Twitter account configured for collection: ${collectionMetadata.collectionName}`, 'AppService');
      return;
    }
    await this.twitterSvc.sendTweet(notificationMessage, twitterAccount, {
      paced: options?.pacedPost,
    });

    // Save the image
    if (Number(process.env.SAVE_IMAGES)) {
      await this.imageSvc.saveImage(collectionMetadata.collectionName, hashId, imageAttachment);
    }
  }

  /**
   * Test method that processes historical events from all configured markets
   * Used for testing event handling with past events rather than live events
   * 
   * Iterates through all markets and their events, processing all historical events found
   * This allows testing the full event handling pipeline with real past data
   */
  async testWithHistory() {
    Logger.log(`Testing with history: ${process.env.TEST_WITH_HISTORY}`, 'AppService');
    
    // Query all marketplaces at once and process each chunk immediately
    await this.evmSvc.indexPreviousEventsMultiMarket(
      markets,
      Number(process.env.TEST_WITH_HISTORY),
      async (logs) => {
        for (const { log, market, event } of this.sortLogsInChainOrder(logs)) {
          await this.enqueueEventHandling(market, event, [log], {
            pacedPost: true,
          });
        }
      }
    );
  }

  /**
   * Test method that processes historical events from all configured markets
   * Used for testing event handling with past events rather than live events
   * 
   * Iterates through all markets and their events, processing all historical events found
   * This allows testing the full event handling pipeline with real past data
   */
  async testWithRange() {
    Logger.log(`Testing with range: ${process.env.TEST_WITH_RANGE}`, 'AppService');
    
    // Query all marketplaces at once and process each chunk immediately
    await this.evmSvc.indexPreviousEventsMultiMarket(
      markets,
      {
        startBlock: Number(process.env.TEST_WITH_RANGE.split(',')[0]),
        endBlock: Number(process.env.TEST_WITH_RANGE.split(',')[1])
      },
      async (logs) => {
        for (const { log, market, event } of this.sortLogsInChainOrder(logs)) {
          await this.enqueueEventHandling(market, event, [log], {
            pacedPost: true,
          });
        }
      }
    );
  }
}
