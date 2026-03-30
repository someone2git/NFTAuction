// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/proxy/transparent/TransparentUpgradeableProxy.sol";

// Re-export OpenZeppelin's TransparentUpgradeableProxy for typechain generation
contract TransparentUpgradeableProxyWrapper is TransparentUpgradeableProxy {
    constructor(address _logic, address admin_, bytes memory _data) payable TransparentUpgradeableProxy(_logic, admin_, _data) {}
}
