export type MarketplaceEvent = {
  signature: string;
  name: string;
  eventTrigger?: {
    signature: string;
    address: `0x${string}`;
  };
} & EventTargets;

export interface Market {
  marketplaceName: string;
  marketplaceUrl?: string;
  address: `0x${string}`;
  events: MarketplaceEvent[];
}

export interface EventTargets {
  hashIdTarget: string;
  valueTarget: string;
  sellerTarget: string;
  buyerTarget: string;
}

export interface Events {
  protocol: {
    transfer: string;
  };
}
