import { Injectable } from '@nestjs/common';

import { AbiEvent, createPublicClient, encodeEventTopics, fromHex, http, parseAbiItem } from 'viem';
import { mainnet } from 'viem/chains';

import { UtilService } from '@/services/util.service';

import { Market, MarketplaceEvent } from '@/models/evm';

import EventEmitter from 'events';
import { config } from 'dotenv';
config();

/**
 * Service for interacting with EVM-compatible blockchains
 */
@Injectable()
export class EvmService {

  private client = createPublicClient({
    chain: mainnet,
    transport: http(process.env.RPC_URL)
  });

  constructor(private readonly utilSvc: UtilService) {}
  
  /**
   * Fetches historical sales events from a marketplace contract by querying logs in chunks
   * @param market The marketplace configuration containing the contract address
   * @param marketEvent The marketplace event configuration containing the event signature and parameters
   * @param blockRange Number of blocks to look back from current block, or object containing start and end blocks
   * @returns Array of event logs matching the event signature
   */
  async indexPreviousEvents(
    market: Market,
    marketEvent: MarketplaceEvent,
    blockRange: number | { startBlock: number; endBlock: number } = 100_000
  ) {
    let startBlock: bigint;
    let endBlock: bigint;

    if (typeof blockRange === 'number') {
      endBlock = await this.client.getBlockNumber();
      startBlock = endBlock - BigInt(blockRange);
    } else {
      startBlock = BigInt(blockRange.startBlock);
      endBlock = BigInt(blockRange.endBlock);
    }

    // Use 250 block chunks to respect Alchemy's eth_getLogs limit
    const CHUNK_SIZE = 250;
    const logs = [];

    // Query in chunks of CHUNK_SIZE blocks
    for (let fromBlock = startBlock; fromBlock <= endBlock; fromBlock += BigInt(CHUNK_SIZE)) {
      const toBlock = fromBlock + BigInt(CHUNK_SIZE) - BigInt(1) > endBlock 
        ? endBlock 
        : fromBlock + BigInt(CHUNK_SIZE) - BigInt(1);
      
      try {
        const chunkLogs = await this.client.getLogs({
          address: market.address,
          event: parseAbiItem(marketEvent.signature) as AbiEvent,
          fromBlock,
          toBlock,
        });
        logs.push(...chunkLogs);
        
        // Small delay to be nice to the RPC provider
        await new Promise(resolve => setTimeout(resolve, 100));
        
      } catch (error) {
        console.error(`Failed to get logs for blocks ${fromBlock}-${toBlock}:`, error);
        // Continue with next batch rather than failing completely
      }
    }
    return logs;
  }

  /**
   * Fetches historical sales events from multiple marketplace contracts by querying logs in chunks
   * More efficient than calling indexPreviousEvents for each marketplace separately
   * @param markets Array of marketplace configurations
   * @param blockRange Number of blocks to look back from current block, or object containing start and end blocks
   * @param onChunkProcessed Optional callback to process logs immediately as each chunk is retrieved
   */
  async indexPreviousEventsMultiMarket(
    markets: Market[],
    blockRange: number | { startBlock: number; endBlock: number } = 100_000,
    onChunkProcessed?: (logs: Array<{ log: any; market: Market; event: MarketplaceEvent }>) => Promise<void>
  ) {
    let startBlock: bigint;
    let endBlock: bigint;

    if (typeof blockRange === 'number') {
      endBlock = await this.client.getBlockNumber();
      startBlock = endBlock - BigInt(blockRange);
    } else {
      startBlock = BigInt(blockRange.startBlock);
      endBlock = BigInt(blockRange.endBlock);
    }

    // Collect all addresses and event signatures
    const addresses = markets.map(m => m.address);
    const eventTopics = markets.flatMap(m => 
      m.events.map(e => {
        const abiEvent = parseAbiItem(e.signature) as AbiEvent;
        return abiEvent;
      })
    );

    const CHUNK_SIZE = 10;
    const totalBlocks = endBlock - startBlock + BigInt(1);
    let processedBlocks = BigInt(0);

    // Query in chunks of CHUNK_SIZE blocks
    for (let fromBlock = startBlock; fromBlock <= endBlock; fromBlock += BigInt(CHUNK_SIZE)) {
      const toBlock = fromBlock + BigInt(CHUNK_SIZE) - BigInt(1) > endBlock 
        ? endBlock 
        : fromBlock + BigInt(CHUNK_SIZE) - BigInt(1);
      
      processedBlocks += (toBlock - fromBlock + BigInt(1));
      const progress = Number((processedBlocks * BigInt(100)) / totalBlocks);
      console.log(`Processing blocks ${fromBlock} - ${toBlock} (${progress}% complete)`);
      
      try {
        // Query all marketplaces at once
        const chunkLogs = await this.client.getLogs({
          address: addresses,
          events: eventTopics,
          fromBlock,
          toBlock,
        });

        // Map logs back to their market and event
        const processedLogs: Array<{ log: any; market: Market; event: MarketplaceEvent }> = [];
        
        for (const log of chunkLogs) {
          const market = markets.find(m => 
            m.address.toLowerCase() === log.address.toLowerCase()
          );
          
          if (!market) continue;

          const event = market.events.find(e => {
            const abiEvent = parseAbiItem(e.signature) as AbiEvent;
            // Encode the event signature to get its topic hash
            const eventTopic = encodeEventTopics({
              abi: [abiEvent],
              eventName: abiEvent.name,
            })[0];
            // Compare the topic hash with the log's first topic
            return log.topics[0] === eventTopic;
          });

          if (event) {
            processedLogs.push({ log, market, event });
          }
        }
        
        // Process this chunk immediately if callback provided
        if (onChunkProcessed && processedLogs.length > 0) {
          console.log(`  Found ${processedLogs.length} event(s) in this chunk`);
          await onChunkProcessed(processedLogs);
        }
        
        // Small delay to be nice to the RPC provider
        await new Promise(resolve => setTimeout(resolve, 100));
        
      } catch (error) {
        console.error(`Failed to get logs for blocks ${fromBlock}-${toBlock}:`, error);
        // Continue with next batch rather than failing completely
      }
    }
  }

  /**
   * Sets up a subscription to watch for new events from a contract
   * @param market The marketplace configuration containing the contract address
   * @param marketEvent The marketplace event configuration containing the event signature and parameters to watch
   * @returns EventEmitter that emits 'event' when new matching logs occur, with cleanup handler to unsubscribe
   */
  watchEvent(market: Market, marketEvent: MarketplaceEvent): EventEmitter {
    const emitter = new EventEmitter();
    
    const unwatch = this.client.watchEvent({
      address: market.address,
      event: parseAbiItem(marketEvent.signature) as AbiEvent,
      onLogs: logs => emitter.emit('event', logs)
    });

    emitter.on('cleanup', () => {
      unwatch();
      emitter.removeAllListeners();
    });

    return emitter;
  }

  /**
   * Retrieves the transaction receipt for a given transaction hash
   * @param transactionHash The hash of the transaction to look up
   * @returns The transaction receipt data
   */
  async getTransactionReceipt(transactionHash: `0x${string}`) {
    return await this.client.getTransactionReceipt({ hash: transactionHash });
  }

  async getBlockTimestamp(blockNumber: bigint): Promise<number> {
    const block = await this.client.getBlock({ blockNumber });
    return Number(block.timestamp);
  }

  /**
   * Retrieves the image data URI from an ethscription transaction by its hash ID
   * @param hashId The hash ID of the ethscription transaction containing the image
   * @returns The data URI string containing the image data, or null if not found
   */
  async getInscriptionImageFromHashId(hashId: `0x${string}`): Promise<string | null> {
    const tx = await this.client.getTransaction({ hash: hashId });
    const dataURI = fromHex(tx.input, 'string');
    return dataURI || null;
  }

  /**
   * Retrieves the ENS name for a given Ethereum address
   * @param address The Ethereum address to look up
   * @returns The ENS name for the address, or null if not found
   */
  async getEnsName(address: `0x${string}`): Promise<string | null> {
    try {
      return await this.client.getEnsName({ address });
    } catch (error) {
      console.error(error);
      return null;
    }
  }
}
