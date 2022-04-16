//SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import '@openzeppelin/contracts/token/ERC20/ERC20.sol';
import '@openzeppelin/contracts/security/Pausable.sol';
import '@openzeppelin/contracts/utils/Address.sol';

// Copyright 2022 6th Street Radio LLC
contract ssrwFTM is ERC20, Pausable {
    using Address for address;

    uint256 private totalDeposit;

    address private _lpwallet;
    ERC20 private _baseToken;

    constructor(address lpwallet, address baseToken)
        ERC20('6SR wFTM LP', 'ssrwFTM') {
        _lpwallet = lpwallet;
        _baseToken = ERC20(baseToken);
        totalDeposit = 0;
    }

    // Deposit wFTM, mint and receive ssrwFTM
    function deposit(uint256 amount) whenNotPaused external returns (bool){
        address account = msg.sender;
        uint256 exrate;

        exrate = rate();
        require(exrate > 0, 'ssrwFTM: LP is empty');

        // ssr token is multiplied by 10^6, 42-6=36
        uint256 ssrAmount = (amount * exrate) / 10**36;

        _baseToken.transferFrom(account, _lpwallet, amount);
        totalDeposit += amount;
        _mint(account, ssrAmount);

        emit Transfer(account, _lpwallet, amount);

        return true;
    }

    // Burn ssrwFTM, receive wFTM with interest
    function withdraw(uint256 amount) whenNotPaused external returns (uint256) {
        address account = msg.sender;
        int256 ex = excess();
        uint256 abex = ex < 1 ? uint256(0) : uint256(ex);
        uint256 exrate;

        exrate = abex;
        require(exrate > 0, 'ssrwFTM: LP is empty');

        // ssr token is multiplied by 10^6, 18+6=24
        uint256 baseAmount = (amount * exrate) / 10**24;

        _burn(account, amount);

        if (baseAmount > totalDeposit) {
            totalDeposit = 0;
        } else {
            totalDeposit -= baseAmount;
        }
        _baseToken.transferFrom(_lpwallet, account, baseAmount);

        emit Transfer(account, address(0), baseAmount);

        return baseAmount;
    }

    // Get balance of pool account minus
    // the deposited tokens.
    function excess() public view returns (int256) {
        return int256(_baseToken.balanceOf(_lpwallet)) - int256(totalDeposit);
    }

    function rate() public view returns (uint256) {
        int256 ex = excess();
        uint256 abex = ex < 1 ? uint256(0) : uint256(ex);
        uint256 exrate;

        // rate is 1/abex times 10^(42+18) where
        // 18 is the number of decimals.
        if (abex > 0) {
            exrate = 10**60 / abex;
        } else {
            exrate = 0;
        }
        return exrate;
    }

    function mint(uint256 amount) external { }

    function burn(uint256 amount) external {
        _burn(msg.sender, amount);
    }

    // Send tokens to the LP wallet, where it is
    // picked up by an external system and sends
    // the bridged asset to the wallet attached
    // to the memo string.
    function swap(uint256 amount, string calldata memo) whenNotPaused external {
        address account = msg.sender;
        _baseToken.transferFrom(account, _lpwallet, amount);
        uint256 fee = (amount * 3) / 10000;
        totalDeposit += (amount - fee);
        emit Swap(account, address(0), amount, fee, memo);
    }

    event Swap(
        address indexed owner, address indexed spender,
        uint256 value, uint256 fee, string memo
    );

    function pause() external {
        require(msg.sender == _lpwallet, 'ssrwFTM: pause permission denied');
        _pause();
    }
    function unpause() external {
        require(msg.sender == _lpwallet, 'ssrwFTM: unpause permission denied');
        _unpause();
    }
}
