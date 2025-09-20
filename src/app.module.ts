import { Module } from '@nestjs/common';
import { CacheModule } from '@nestjs/cache-manager';
import { AppService } from '@/app.service';

import { EvmService } from '@/services/evm.service';
import { DataService } from '@/services/data.service';
import { TwitterService } from '@/services/twitter.service';
import { ImageService } from '@/services/image.service';
import { CollectionService } from '@/services/collection.service';
import { UtilService } from '@/services/util.service';
import { MultiRPCProviderService } from '@/services/multi-rpc-provider.service';

@Module({
  imports: [
    CacheModule.register({
      ttl: 24 * 60 * 60 * 1000,
    }),
  ],
  controllers: [],
  providers: [
    AppService,
    {
      provide: MultiRPCProviderService,
      useFactory: () => {
        // Parse RPC URLs from environment variables
        const rpcUrls = process.env.RPC_URLS
          ? process.env.RPC_URLS.split(',').map(url => url.trim())
          : [process.env.RPC_URL || 'https://eth-mainnet.g.alchemy.com/v2/gVB2RUnfJN6vIsZCISVzz']; // fallback to original RPC_URL
        
        return new MultiRPCProviderService(rpcUrls);
      },
    },
    EvmService,
    DataService,
    TwitterService,
    ImageService,
    CollectionService,
    UtilService
  ],
})
export class AppModule {}

