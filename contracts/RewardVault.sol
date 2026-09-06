// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";

contract RewardVault is Ownable {
    using SafeERC20 for IERC20;

    IERC20 public immutable rewardToken;

    struct Epoch {
        bytes32 merkleRoot;
        uint256 totalAllocated;
        uint256 totalClaimed;
        bool exists;
    }

    uint256 public currentEpoch;
    mapping(uint256 => Epoch) public epochs;
    mapping(uint256 => mapping(address => bool)) public claimed;

    event EpochPublished(uint256 indexed epoch, bytes32 merkleRoot, uint256 totalAllocated);
    event Claimed(uint256 indexed epoch, address indexed holder, uint256 amount);

    constructor(address rewardToken_) Ownable(msg.sender) {
        rewardToken = IERC20(rewardToken_);
    }

    function publishEpoch(bytes32 merkleRoot, uint256 totalAllocated) external onlyOwner {
        currentEpoch += 1;
        epochs[currentEpoch] = Epoch({
            merkleRoot: merkleRoot,
            totalAllocated: totalAllocated,
            totalClaimed: 0,
            exists: true
        });
        emit EpochPublished(currentEpoch, merkleRoot, totalAllocated);
    }

    function claim(uint256 epoch, uint256 amount, bytes32[] calldata proof) external {
        Epoch storage e = epochs[epoch];
        require(e.exists, "epoch does not exist");
        require(!claimed[epoch][msg.sender], "already claimed");

        bytes32 leaf = keccak256(bytes.concat(keccak256(abi.encode(msg.sender, amount))));
        require(MerkleProof.verify(proof, e.merkleRoot, leaf), "invalid proof");

        claimed[epoch][msg.sender] = true;
        e.totalClaimed += amount;

        rewardToken.safeTransfer(msg.sender, amount);
        emit Claimed(epoch, msg.sender, amount);
    }

    function poolBalance() external view returns (uint256) {
        return rewardToken.balanceOf(address(this));
    }
}