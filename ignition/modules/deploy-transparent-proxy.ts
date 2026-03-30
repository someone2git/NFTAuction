import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

/**
 * 透明代理模式部署模块 - NFTAuction
 *
 * 部署结构：
 * 1. NFTAuction 实现合约
 * 2. TransparentUpgradeableProxy 代理合约
 * 3. 初始化代理合约
 */
export default buildModule("NFTAuctionTransparentProxy", (m) => {
  // 参数：管理员地址（从命令行或配置读取）
  const admin = m.getAccount(0); // 默认使用第一个账户

  // 1. 部署实现合约
  const implementation = m.contract("NFTAuction", []);

  // 2. 编码初始化数据
  const initializeData = m.encodeFunctionCall(implementation, "initialize", [admin]);

  // 3. 部署透明代理合约
  // TransparentUpgradeableProxyWrapper 构造函数参数：
  // - _logic: 实现合约地址
  // - admin_: 管理员地址
  // - _data: 初始化数据
  const proxy = m.contract("TransparentUpgradeableProxyWrapper", [
    implementation,
    admin,
    initializeData,
  ]);

  return {
    implementation,
    proxy,
  };
});
