// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract RewardToken is ERC20, Ownable {
    uint256 public feeBps;
    address public vault;

    mapping(address => bool) public isFeeExempt;

    event FeeCollected(address indexed from, uint256 amount);
    event FeeUpdated(uint256 newFeeBps);
    event VaultUpdated(address newVault);

    constructor(
        string memory name_,
        string memory symbol_,
        uint256 totalSupply_,
        uint256 feeBps_,
        address vault_
    ) ERC20(name_, symbol_) Ownable(msg.sender) {
        require(feeBps_ <= 1000, "fee too high");
        feeBps = feeBps_;
        vault = vault_;
        isFeeExempt[vault_] = true;
        isFeeExempt[msg.sender] = true;
        _mint(msg.sender, totalSupply_);
    }

    function setFeeExempt(address account, bool exempt) external onlyOwner {
        isFeeExempt[account] = exempt;
    }

    function setFeeBps(uint256 newFeeBps) external onlyOwner {
        require(newFeeBps <= 1000, "fee too high");
        feeBps = newFeeBps;
        emit FeeUpdated(newFeeBps);
    }

    function setVault(address newVault) external onlyOwner {
        vault = newVault;
        isFeeExempt[newVault] = true;
        emit VaultUpdated(newVault);
    }

    function _update(address from, address to, uint256 value) internal override {
        if (from == address(0) || to == address(0) || isFeeExempt[from] || isFeeExempt[to] || feeBps == 0) {
            super._update(from, to, value);
            return;
        }

        uint256 fee = (value * feeBps) / 10_000;
        uint256 amountAfterFee = value - fee;

        super._update(from, vault, fee);
        super._update(from, to, amountAfterFee);

        emit FeeCollected(from, fee);
    }
}