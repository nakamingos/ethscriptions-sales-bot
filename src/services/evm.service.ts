import { Injectable } from '@nestjs/common';

import { AbiEvent, fromHex, parseAbiItem } from 'viem';

import { UtilService } from '@/services/util.service';
import { MultiRPCProviderService } from '@/services/multi-rpc-provider.service';

import { Market, MarketplaceEvent } from '@/models/evm';

import EventEmitter from 'events';
import { config } from 'dotenv';
config();

/**
 * Service for interacting with EVM-compatible blockchains
 */
@Injectable()
export class EvmService {

  constructor(
    private readonly utilSvc: UtilService,
    private readonly multiRpcProvider: MultiRPCProviderService
  ) {}
  
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
      endBlock = await this.multiRpcProvider.safeCall(client => client.getBlockNumber());
      startBlock = endBlock - BigInt(blockRange);
    } else {
      startBlock = BigInt(blockRange.startBlock);
      endBlock = BigInt(blockRange.endBlock);
    }

    // Use 500 block chunks to respect Alchemy's eth_getLogs limit
    const CHUNK_SIZE = 500;
    const logs = [];

    // Query in chunks of CHUNK_SIZE blocks
    for (let fromBlock = startBlock; fromBlock <= endBlock; fromBlock += BigInt(CHUNK_SIZE)) {
      const toBlock = fromBlock + BigInt(CHUNK_SIZE) - BigInt(1) > endBlock 
        ? endBlock 
        : fromBlock + BigInt(CHUNK_SIZE) - BigInt(1);
      
      try {
        const chunkLogs = await this.multiRpcProvider.safeCall(client => 
          client.getLogs({
            address: market.address,
            event: parseAbiItem(marketEvent.signature) as AbiEvent,
            fromBlock,
            toBlock,
          })
        ) as any[];
        logs.push(...chunkLogs);
        
        // Conservative delay to respect RPC provider rate limits (Infura: ~10 req/sec)
        // Using 500ms to be extra safe and avoid overwhelming free tier limits
        await new Promise(resolve => setTimeout(resolve, 500));
        
      } catch (error) {
        console.error(`Failed to get logs for blocks ${fromBlock}-${toBlock}:`, error);
        // Continue with next batch rather than failing completely
      }
    }
    return logs;
  }

  /**
   * Sets up a subscription to watch for new events from a contract
   * @param market The marketplace configuration containing the contract address
   * @param marketEvent The marketplace event configuration containing the event signature and parameters to watch
   * @returns EventEmitter that emits 'event' when new matching logs occur, with cleanup handler to unsubscribe
   */
  watchEvent(market: Market, marketEvent: MarketplaceEvent): EventEmitter {
    const emitter = new EventEmitter();
    
    const client = this.multiRpcProvider.getClient();
    const unwatch = client.watchEvent({
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
    return await this.multiRpcProvider.safeCall(client => 
      client.getTransactionReceipt({ hash: transactionHash })
    );
  }

  /**
   * Retrieves the image data URI from an ethscription transaction by its hash ID
   * @param hashId The hash ID of the ethscription transaction containing the image
   * @returns The data URI string containing the image data, or null if not found
   */
  async getInscriptionImageFromHashId(hashId: `0x${string}`): Promise<string | null> {
    const tx = await this.multiRpcProvider.safeCall(client => 
      client.getTransaction({ hash: hashId })
    ) as any;
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
      return await this.multiRpcProvider.safeCall(client => 
        client.getEnsName({ address })
      );
    } catch (error) {
      console.error(error);
      return null;
    }
  }
}
