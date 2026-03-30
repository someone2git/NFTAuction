import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

/**
 * UUPS 代理模式部署模块 - NFTAuctionUUPS
 * 
 * 部署结构：
 * 1. NFTAuctionUUPS 实现合约（不初始化）
 * 2. ERC1967Proxy 代理合约
 * 3. 通过代理初始化实现合约
 */
export default buildModule("NFTAuctionUUPSProxy", (m) => {
  // 参数：管理员/所有者地址（从命令行或配置读取）
  const owner = m.getAccount(0); // 默认使用第一个账户

  // 1. 部署实现合约
  // NFTAuctionUUPS 构造函数不需要参数，内部 _disableInitializers()
  const implementation = m.contract("NFTAuctionUUPS", [], {
    contractName: "NFTAuctionUUPS",
  });

  // 2. 编码初始化数据
  const initializeData = m.encodeFunctionCall(implementation, "initialize", [owner]);

  // 3. 部署 ERC1967Proxy 代理合约
  // ERC1967Proxy 构造函数参数：
  // - _logic: 实现合约地址
  // - _data: 初始化数据（会自动调用）
  const proxy = m.contract("ERC1967ProxyWrapper", [
    implementation,
    initializeData,
  ], {
    contractName: "ERC1967ProxyWrapper",
  });

  return { 
    implementation, 
    proxy,
    owner 
  };
});
