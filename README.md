# NFTAuction

## 拍卖合约

1. ### 拍卖逻辑

   1.竞拍信息

   ```
   /**
        * @notice 拍卖数据结构
        * @param nft NFT合约地址（ERC721）
        * @param nftId NFT代币ID
        * @param seller 卖家地址，拍卖结束后接收最高出价
        * @param startingTime 拍卖开始时间（区块时间戳）
        * @param highestBidder 当前最高出价者地址
        * @param startingPriceInDollar 起拍价（美元计价，8位小数）
        * @param duration 拍卖持续时间（秒）
        * @param paymentToken 指定的支付代币地址
        * @param highestBid 当前最高出价（代币原生单位）
        * @param highestBidInDollar 当前最高出价（美元计价，8位小数）
        * @param highestBidToken 当前最高出价使用的代币地址，address(0)表示ETH
        */
       struct Auction {
           IERC721 nft;
           uint256 nftId;
           address payable seller;
           uint256 startingTime;
           address highestBidder;
           uint256 startingPriceInDollar;
           uint256 duration;
           IERC20 paymentToken;
           uint256 highestBid;
           uint256 highestBidInDollar;
           address highestBidToken;
       }
   ```

   2.竞拍id和拍卖信息映射

   ```
       mapping(uint256 => Auction) public auctions;
   ```

   3.事件

   竞拍开始事件、竞拍事件、竞拍结束事件

   4.开始竞拍、出竞拍价、结束竞拍

   注意出竞拍价，同时将竞拍价金额交给合约托管，判断如果不是最高价，会revert。

2. ### 预言机

   1.代币和预言机映射

   ```
       mapping(address => address) public tokenToOracle;
   ```

   2.请求预言机，获取代币转换美金汇率

   2.代币转换美金

3. ### 代理

   1.集成Initializable，initialize方法实现合约初始化

   ```
       function initialize(address admin_) external initializer {
           require(admin_ != address(0), "invalid admin");
           admin = admin_;
       }
   ```

   2.uups模式继承UUPSUpgradeable

   3.构造方法防治逻辑合约被初始化

   ```
       constructor() {
          _disableInitializers();
       }
   ```


## 单元测试

执行单测，并输出覆盖率

```
npx hardhat test --coverage
```

## 部署

新建.env，配置SEPOLIA_RPC_URL、SEPOLIA_PRIVATE_KEY

```
npx hardhat ignition deploy ignition/modules/deploy-uups-proxy.ts --network sepolia
```

出现successfully deployed 部署成功。

Etherscan上搜索私钥对应的地址，能够看到部署的交易记录。
