export const ESIP1 = `event ethscriptions_protocol_TransferEthscription(address indexed recipient, bytes32 indexed ethscriptionId)`;
// Example: 0x594eb8cfafe74f3d766a55a20d896b867e8cafd842f42ec72ed77d23d8b282fb

export const ESIP2 = `event ethscriptions_protocol_TransferEthscriptionForPreviousOwner(address indexed previousOwner, address indexed recipient, bytes32 indexed id)`;
// Example: 0xc1c15b1ca214aaeb02809c93234113aef8be1f6666740d4fe65af8ec25ade7fe

export const ethscriptionsDotComSaleSignature = `event EthscriptionPurchased(address indexed seller, address indexed buyer, bytes32 indexed ethscriptionId, uint256 price, bytes32 listingId)`;
// Example: 0xe9e1a1e85e731a4c972370876b6e48312f922bbdd9c1e951ef79783c5d8848af

export const etchSaleSignature = `event EthscriptionOrderExecuted(bytes32 indexed orderHash, uint256 orderNonce, bytes32 ethscriptionId, uint256 quantity, address seller, address buyer, address currency, uint256 price, uint64 endTime)`;
// Example: 0xc1c15b1ca214aaeb02809c93234113aef8be1f6666740d4fe65af8ec25ade7fe

export const ordexSaleSignature = `event Match(bytes32 leftHash, bytes32 rightHash, uint256 newLeftFill, uint256 newRightFill)`;
// Example: 0x594eb8cfafe74f3d766a55a20d896b867e8cafd842f42ec72ed77d23d8b282fb

export const ordexInternalTransferSignature = `event InternalItemTransfer(address indexed _from, address indexed _to, uint256 indexed _ethscriptionId)`;
// Example: 0x594eb8cfafe74f3d766a55a20d896b867e8cafd842f42ec72ed77d23d8b282fb

export const etherPhunksSaleSignature = `event PhunkBought(bytes32 indexed phunkId, uint256 value, address indexed fromAddress, address indexed toAddress)`;
// Example: 0xedc24e0093c5843f30f5230c70667ab34d030619e8c91bbc124012ecba289f0b

export const memeScribeSaleSignature = `event EthscriptionPurchased(bytes32 indexed ethscriptionId, uint256 price, address indexed seller, address indexed buyer)`;
// Example: 0xfaebaf69df34013777ac50febc63727d6761b16c8bb860a799fcdaa334ea09e7

export const ittybitsSaleSignature = `event IttybitBought(index_topic_1 bytes32 ittybitId, uint256 value, index_topic_2 address fromAddress, index_topic_3 address toAddress)`;
// Example: 0xb7fee67029204535f512543713c48e7ca36a873e5b85878b075713feb8e52c96