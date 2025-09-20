import { Injectable, Logger } from '@nestjs/common';
import { createPublicClient, http } from 'viem';
import { mainnet } from 'viem/chains';

@Injectable()
export class MultiRPCProviderService {
  private readonly logger = new Logger(MultiRPCProviderService.name);
  private readonly clients: any[] = [];
  private currentIndex = 0;
  private requestCount = 0;
  private readonly rotationThreshold = 100;

  constructor(private readonly rpcUrls: string[]) {
    if (!rpcUrls || rpcUrls.length === 0) {
      throw new Error('At least one RPC URL must be provided');
    }

    // Initialize clients for each RPC URL
    for (let i = 0; i < rpcUrls.length; i++) {
      const url = rpcUrls[i];
      this.logger.log(`Initializing RPC client ${i + 1}/${rpcUrls.length}: ${url}`);
      
      const client = createPublicClient({
        chain: mainnet,
        transport: http(url),
      });
      
      this.clients.push(client);
    }

    this.logger.log(`MultiRPCProvider initialized with ${this.clients.length} providers`);
  }

  /**
   * Get the current active client
   */
  getClient(): any {
    return this.clients[this.currentIndex];
  }

  /**
   * Rotate to the next provider if we've hit the rotation threshold
   */
  private maybeRotate(): void {
    this.requestCount++;
    
    if (this.requestCount >= this.rotationThreshold) {
      this.rotateToNext();
      this.requestCount = 0;
    }
  }

  /**
   * Manually rotate to the next provider
   */
  private rotateToNext(): void {
    const previousIndex = this.currentIndex;
    this.currentIndex = (this.currentIndex + 1) % this.clients.length;
    this.logger.debug(`Rotated from provider ${previousIndex} to ${this.currentIndex}`);
  }

  /**
   * Execute a function with automatic failover across providers
   */
  async safeCall<T>(fn: (client: any) => Promise<T>): Promise<T> {
    const maxAttempts = this.clients.length;
    let lastError: Error | null = null;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const currentClient = this.getClient();
      
      try {
        this.logger.debug(`Attempting request with provider ${this.currentIndex} (attempt ${attempt + 1}/${maxAttempts})`);
        
        const result = await fn(currentClient);
        
        // Successful request - maybe rotate for next time
        this.maybeRotate();
        
        if (attempt > 0) {
          this.logger.log(`Request succeeded on attempt ${attempt + 1} with provider ${this.currentIndex}`);
        }
        
        return result;
      } catch (error) {
        lastError = error as Error;
        
        this.logger.warn(
          `Request failed with provider ${this.currentIndex} (attempt ${attempt + 1}/${maxAttempts}): ${lastError.message}`
        );

        // If this isn't the last attempt, rotate to next provider
        if (attempt < maxAttempts - 1) {
          this.rotateToNext();
        }
      }
    }

    // All providers failed
    this.logger.error(`All ${maxAttempts} providers failed. Last error: ${lastError?.message}`);
    throw new Error(`All RPC providers failed. Last error: ${lastError?.message}`);
  }

  /**
   * Get current provider info for monitoring/debugging
   */
  getProviderInfo() {
    return {
      currentIndex: this.currentIndex,
      totalProviders: this.clients.length,
      requestCount: this.requestCount,
      nextRotationIn: this.rotationThreshold - this.requestCount,
      rpcUrls: this.rpcUrls,
    };
  }

  /**
   * Manually set the current provider index (useful for testing or manual failover)
   */
  setCurrentProvider(index: number): void {
    if (index < 0 || index >= this.clients.length) {
      throw new Error(`Invalid provider index: ${index}. Must be between 0 and ${this.clients.length - 1}`);
    }
    
    const previousIndex = this.currentIndex;
    this.currentIndex = index;
    this.requestCount = 0; // Reset counter when manually switching
    
    this.logger.log(`Manually switched from provider ${previousIndex} to ${index}`);
  }
}