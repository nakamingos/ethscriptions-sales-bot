import { Injectable, OnModuleInit, Logger } from '@nestjs/common';

import { UtilService } from '@/services/util.service';
import { DataService } from '@/services/data.service';

import { collections } from '@/constants/collections';

import { JSONCollection } from '@/models/collection';
import { InscriptionMetadata } from '@/models/inscription';

/**
 * Service for managing Ethscription collection data and metadata
 */
@Injectable()
export class CollectionService implements OnModuleInit {
  
  /**
   * In-memory cache mapping inscription hash IDs to collection metadata
   * Key format: inscription:<lowercase_hash_id>
   */
  memoryCache: Map<string, InscriptionMetadata> = new Map();

  /**
   * Store collection metadata indexed by collection name for API fallback lookups
   * Key format: collection:<lowercase_collection_name>
   */
  collectionDataCache: Map<string, { 
    collectionName: string;
    collectionImageHash: `0x${string}` | null;
    backgroundColor: string;
    websiteLink: string;
    collectionImageUri: string;
    twitterAccount: string;
    items: any[];
  }> = new Map();

  constructor(
    private readonly utilSvc: UtilService,
    private readonly dataSvc: DataService
  ) {}

  /**
   * Loads supported collection data when service initializes
   */
  async onModuleInit() {
    await this.loadSupportedCollections();
  }

  /**
   * Normalize a SHA string: lowercase and strip optional 0x prefix
   * @param s SHA string possibly with 0x prefix
   * @returns normalized sha without 0x or undefined
   */
  private normalizeSha(s?: string | null): string | undefined {
    if (!s) return undefined;
    return s.toLowerCase().replace(/^0x/, '');
  }

  /**
   * Looks up collection metadata for a given inscription hash ID
   * First checks cache, then falls back to API lookup for unindexed collections
   * 
   * @param hashId - The Ethscription hash ID to look up
   * @returns Collection metadata object if inscription is from a supported collection, undefined otherwise
   */
  async getSupportedInscription(hashId: string): Promise<InscriptionMetadata | undefined> {
    if (!hashId) return;
  
    const cacheKey = `inscription:${hashId.toLowerCase()}`;
    
    // First check if it's in the cache
    const cached = this.memoryCache.get(cacheKey);
    if (cached) return cached;

    // If not in cache, try API lookup for unindexed collections
    Logger.log(`Inscription ${hashId} not in cache, checking API...`, 'CollectionService');
    const apiResult = await this.lookupInscriptionFromAPI(hashId);
    
    if (apiResult) {
      // Cache it for future lookups
      this.memoryCache.set(cacheKey, apiResult);
      Logger.log(`Found and cached inscription ${hashId} for collection: ${apiResult.collectionName}`, 'CollectionService');
    }
    
    return apiResult;
  }

  /**
   * Looks up an inscription from the API and tries to match it to a known collection by SHA
   * 
   * @param hashId - The Ethscription hash ID to look up
   * @returns Collection metadata if the inscription belongs to a supported collection, undefined otherwise
   */
  private async lookupInscriptionFromAPI(hashId: string): Promise<InscriptionMetadata | undefined> {
    try {
      // Fetch inscription data from API
      const inscriptionData = await this.dataSvc.fetchInscriptionByHashId(hashId);
      if (!inscriptionData) {
        Logger.debug(`No API data found for inscription ${hashId}`, 'CollectionService');
        return undefined;
      }

      // Check if we have this SHA cached (normalize both sides)
      const contentSha = this.normalizeSha(inscriptionData.content_sha);
      if (contentSha) {
        const shaCacheKey = `sha:${contentSha}`;
        const cachedBySha = this.memoryCache.get(shaCacheKey);

        if (cachedBySha) {
          Logger.log(`Matched inscription ${hashId} to collection by SHA: ${cachedBySha.collectionName}`, 'CollectionService');
          return cachedBySha;
        }
      }

      Logger.debug(`Inscription ${hashId} (SHA: ${contentSha}) does not match any supported collection`, 'CollectionService');
      return undefined;
    } catch (error) {
      Logger.error(`Error looking up inscription ${hashId} from API: ${error.message}`, 'CollectionService');
      return undefined;
    }
  }

  /**
   * Loads and caches metadata for all configured collections
   * @throws Error if collection data cannot be fetched or parsed
   */
  async loadSupportedCollections() {
    try {
      for (const collection of collections) {
        const response = await fetch(collection.metadataUrl);
        if (!response.ok) {
          throw new Error(`Failed to fetch collection: ${collection}`);
        }

        // TODO: Fix this
        // Currently supports standard metadata, etherphunk market metadata, and emblem vault metadata
        const data = await response.json() as JSONCollection | any;

        const collectionName = data.name;
        const collectionImageHash = this.utilSvc.extractHex(
          data.logo_image_uri || data.inscription_icon || data.logo_image,
        );
        const backgroundColor = data.background_color;
        const websiteLink = data.website_link || data.website_url;
        const twitterAccount = collection.twitterAccount; // Extract the Twitter account

        // Store collection data for API fallback lookups
        const collectionCacheKey = `collection:${collectionName.toLowerCase()}`;
        this.collectionDataCache.set(collectionCacheKey, {
          collectionName,
          collectionImageHash,
          backgroundColor,
          websiteLink,
          collectionImageUri: data.logo_image_uri || data.inscription_icon || data.logo_image,
          twitterAccount,
          items: data.collection_items || (data as any).inscriptions || [],
        });

        let cachedCount = 0;
        for (const item of (data.collection_items || (data as any).inscriptions)) {
          const hashId = item.ethscription_id?.toLowerCase() || item.id?.toLowerCase();
          const sha = this.normalizeSha(item.sha || item.content_sha);
          
          const cacheData = {
            collectionName,
            collectionImageHash,
            itemName: item.name || item.meta?.name,
            backgroundColor,
            websiteLink,
            collectionImageUri: data.logo_image_uri || data.inscription_icon || data.logo_image,
            twitterAccount, // Add the Twitter account to the cache
          };
          
          // Cache by transaction hash if available
          if (hashId) {
            const cacheKey = `inscription:${hashId}`;
            this.memoryCache.set(cacheKey, cacheData);
            cachedCount++;
          }
          
          // Also cache by SHA for unindexed collections
          if (sha) {
            const shaCacheKey = `sha:${sha}`;
            this.memoryCache.set(shaCacheKey, cacheData);
            if (!hashId) cachedCount++; // Only increment if we didn't count it above
          }
        }

        Logger.log(`Loaded ${data.name} collection (${cachedCount} items cached, ${(data.collection_items || (data as any).inscriptions).length} total items)`, 'CollectionService');
      }
    } catch (error) {
      console.error('Failed to load collections:', error);
      throw error;
    }
  }
}
