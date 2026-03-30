import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

/**
 * 透明代理升级模块 - 升级到 V2
 * 
 * 使用方式：
 * npx hardhat ignition deploy ignition/modules/upgrade-transparent-proxy.ts \
 *   --network sepolia \
 *   --parameters ignition/modules/parameters/upgrade-transparent-params.json
 */
export default buildModule("NFTAuctionTransparentProxyUpgrade", (m) => {
  // 从参数文件读取代理合约地址
  const proxyAddress = m.getParameter("proxyAddress", "0x0000000000000000000000000000000000000000");
  
  // 1. 部署 V2 实现合约
  const implementationV2 = m.contract("NFTAuctionV2", [], {
    contractName: "NFTAuctionV2",
  });

  // 2. 获取现有代理合约
  // 注意：Ignition 不直接支持获取已部署的代理合约进行升级
  // 这里返回实现合约地址，实际升级需要通过脚本执行
  
  return { 
    implementationV2,
    proxyAddress
  };
});
