// SPDX-License-Identifier: MIT
pragma solidity >=0.4.22 <0.9.0; // @audit-issue TOO WIDE VERSION RANGE

import "@openzeppelin/contracts/token/ERC20/ERC20.sol"; // @audit-issue TYPO import IERC20 instead

contract AirdropFundContract { // OK

    uint256 public maxBalance;
    uint256 public balance;
    address public owner;
    address public token; // @audit-issue UNUSED // @audit-issue IMMUTABLE?

    IERC20 itoken; // @audit-issue PRIVATE // @audit-issue IMMUTABLE

event TransferSent(address _from,address _destAddr,uint _amount); // @audit-issue TYPO formatting (format after audit resolutions please) // @audit-issue INDEXING destAddr should be indexed as the sole parameter, from should be removed.

    constructor(address _owner, IERC20 _itoken) {
            owner = _owner;
            itoken = _itoken;
       }

    function init() public onlyOwner{ // @audit PRIV // @audit-issue EVENT // @audit-issue EXTERNAL
        if(maxBalance==0){ // @note Init, when called for the first time, sets the maxBalance, afterwards it only sets the current balance.
            maxBalance = itoken.balanceOf(address(this)); // OK
        } // OK
        balance = itoken.balanceOf(address(this)); // OK
    }

    function allocate(address to, uint256 amount) public onlyOwner{ // @audit PRIV // @audit-issue EXTERNAL
        uint256 newBalance = itoken.balanceOf(address(this)); // ok

        if (maxBalance == 0){ // @note init does not need to be called at all as the first allocate will force it too. // @audit-issue delete init?
            maxBalance = newBalance; // @note if init not called yet, it's essentially force called here.
        } // OK

        balance = newBalance; // @note Balance is reset to whatever the actual balance is of the contract // @audit-issue GAS this function writes twice to balance and reads from it instead of reading from the local variable

        require(amount > 0 , "Need to request more than 0 BFG"); 
        require(balance > 0 , "No more BFG to collect");// @audit-issue GAS read from newBalance instead

        uint256 amountConverted = amount * 1000000000000000000; // @audit-issue TYPO what's the point of this, can't frontend do this ? Also consider multiplying by 1 ethers.

        if(amountConverted > balance){// @note allocate reduces amount to whatever is in the contract. // @audit-issue GAS read from newBalance instead
            amountConverted = balance; // @note if amount is greater than balance, amount is set to balance. // @audit-issue GAS read from newBalance instead
        }

        itoken.transfer(to,amountConverted); // OK
        balance-= amountConverted; // OK

        emit TransferSent(address(this),to,amountConverted); // @audit-issue What's the benefit of emmitting address(this) ?
    }


    modifier onlyOwner() { // @audit-issue TYPO modifiers are usually put at the top of the contract
        require(msg.sender == owner, "Ownable: caller is not the owner"); // OK
        _; // OK
    } // OK

    function transferOwnership(address newOwner) public onlyOwner { // @audit PRIV // @audit-issue EXTERNAL // @audit-issue EVENT
        require(newOwner != address(0), "can't have owner with zero address"); // OK
        owner = newOwner; // OK
    } // OK
} // OK