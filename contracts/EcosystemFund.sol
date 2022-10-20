// SPDX-License-Identifier: MIT
pragma solidity >=0.4.22 <0.9.0; // @audit-issue Too wide

import "@openzeppelin/contracts/token/ERC20/ERC20.sol"; // @audit-issue Use IERC20 instead

contract EcosystemFundContract {

    uint256 public maxBalance; // @note used for UI purposes?
    uint256 public balance; // @note set to current balance of contract
    address public owner; 
    address public token; // @audit-issue IMMUTABLE
    uint256 public lastUnlockTime; // @note set to Oct 08 2022 on deployment, updated within withdrawal
    IERC20 itoken; // @audit-issue IMMUTABLE
    
    uint16 public vestingCycles; // @note incremented in withdrawal.

    event TransferSent(address _from,address _destAddr,uint _amount); // @audit-issue remove from, index destAddr

        constructor(address _owner, IERC20 _itoken) { // ok
            owner = _owner; // ok
            token = address(_itoken); // OK
            itoken = _itoken; // OK
            lastUnlockTime = 1665243000; // @audit-issue can be set directly at the top of the contract
            vestingCycles = 0; // @audit-issue UNNECESSARY
       }

    function init() public onlyOwner(){ // @audit PRIV // @audit-issue EVENT // @audit-issue EXTERNAL 
        if(maxBalance == 0){ // ok
            maxBalance = itoken.balanceOf(address(this));// @note if maxBalance wasn't set before, we set it once to the contract balance
        }
        balance = itoken.balanceOf(address(this)); // @note current balance is initialized to contract balance
    }

    function Withdraw(address _address, uint256 amount) public onlyOwner{ // @audit PRIV // @audit-issue EXTERNAL
        uint256 newBalance = itoken.balanceOf(address(this)); // OK
        
        if (maxBalance == 0){ // @audit-issue redundant with init, init can be removed?
            maxBalance = newBalance;
        }

        balance = newBalance;// OK

        require(amount > 0 , "Need to request more than 0 BFG");
        require(balance > 0 , "No more BFG to collect");
      
        //3 months cliff // @audit-issue this cliff does not unlock anything?
		if(vestingCycles == 0){ // OK
			require(block.timestamp > lastUnlockTime + 90 days , "Too early for unlocking tokens"); // OK
			lastUnlockTime = lastUnlockTime + 90 days; // @note TYPO use += // @audit-issue no unlock seems to have occured here, what's  the point of shifting this amount?
            vestingCycles ++; // OK
            return; // @note returns
		}
        //Unlocked
		if(vestingCycles > 0){ // @audit-issue No checks that time has passed after cliff, any funds can be withdrawn.
            uint256 amountConverted = amount * 1000000000000000000; // @note amount is in ethers
			
            if(amountConverted > balance){ // @note we allow claiming up to balance, otherwise its reduced automatically
                amountConverted = balance;  // OK 
            } // OK

			itoken.transfer(_address,amountConverted); // @audit-issue safeTransfer (GLOBAL ISSUE, also in airdrop contract!)
            balance-=amountConverted; // @audit-issue if _address is set to this contract, the balance would temporarily be wrong (though it can often be wrong as recipient can ofc send tokens to it)
            lastUnlockTime = block.timestamp; // OK
            vestingCycles++; // @audit-issue after first claim this will be set to 2.

            emit TransferSent(address(this),_address,amountConverted);
		}
    }

    modifier onlyOwner() { // ok
        require(msg.sender == owner, "Ownable: caller is not the owner"); // ok
        _; // ok
    } // ok

    function transferOwnership(address newOwner) public onlyOwner { // @audit PRIV // @audit-issue EVENT // @audit-issue EXTERNAL
        require(newOwner != address(0), "can't have owner with zero address"); // OK
        owner = newOwner; // OK
    } // OK

}