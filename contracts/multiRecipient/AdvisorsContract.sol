// SPDX-License-Identifier: MIT
pragma solidity >=0.4.22 <0.9.0;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract AdvisorsContract {

    uint256 public maxBalance; // @note set if balance == 0?
    uint256 public balance; // OK
    address public owner; // OK
    address public token; // @audit-issue IMMUTABLE (Double check if we can make this a global issue)
    uint256 public constUnlockTime; // OK
    uint256 public allOwned; // OK

    IERC20 itoken;// @audit-issue IMMUTABLE
    
    uint16 public vestingCycles; // @audit-issue uint256
    mapping(address => uint256) public whiteList; // @audit-issue UNUSED (also bool would be better)

    mapping(address => uint256) public ownedBFG; // OK @note total allocated
    mapping(address => uint256) public lockedBFG; // @note current amount (total - withdrawn)
    mapping(address => uint256) public lastUnlockTime; // OK

    event TransferSent(address _from,address _destAddr,uint _amount);

        constructor(address _owner, IERC20 _itoken) { //OK
            owner = _owner;
            token = address(_itoken);
            itoken = _itoken;
            //starting 8.10 17:30
            constUnlockTime = 1665243000; // @audit-issue done on declaration
            vestingCycles = 0; // @audit-issue unnecessary
            allOwned = 0;// @audit-issue unnecessary
       }
    
     function addWhiteList(address user,uint256 amount) public onlyOwner{ // @audit-issue EXTERNAL // @audit-issue EVENT
        uint256 amountConverted = amount * 1000000000000000000; // @audit-issue weird
        if (balance == 0){ // @todo HMMMM
                uint256 _balance = itoken.balanceOf(address(this));
                balance = _balance;
                maxBalance = _balance; // @note what happens if the contract is refilled after running out of token
        }
        require(balance > 0,"no BFG available"); 
        require(amount > 0,"Amount send must be greater than 0");
        require(maxBalance-allOwned >= amountConverted, "not enough BFG available to send.");  // @audit-issue can underflow: // 1. addWhitelist => maxBalance = 10 | 2. Give someone 10 => allOwned = 10 | 3. withdraw(10) | 4. addWhitelist (1)
        require(ownedBFG[user] == 0, "Already whitelisted"); // OK

        allOwned += amountConverted; // OK
        ownedBFG[user] += amountConverted; // @todo Validate property: ownedBFG is non-decreasing, lockedBFG is always <= ownedBFG
        lockedBFG[user] += amountConverted; // OK
        //starting 8.10 17:30
        lastUnlockTime[user] = 1665243000; // @audit-issue TYPO magic value, create a constant for this

	    whiteList[user] = 1; // OK
    }

    function getDaysUnlocked(uint8 daysPast, address _receiver) internal{ // OK
        
        //tokens for 1 day
		uint256 newTokens = ownedBFG[_receiver] * 139 / 100000; // @note 0.139% per day // @audit-issue div-before-mul
		//tokens for daysPast days
		
        //transfer
        require(lockedBFG[_receiver] > 0, "No more tokens for unlock"); // @audit-issue unnecessary, already checked: remove or make assert
        uint256 calTokens = newTokens * daysPast; // OK
        if(calTokens > lockedBFG[_receiver]){ // OK
            calTokens = lockedBFG[_receiver]; // OK
        }
        itoken.transfer(_receiver,calTokens); // @audit-issue CEI move down. // @audit-issue safeTransfer
        balance-=calTokens; // OK
        lockedBFG[_receiver] -= calTokens; // OK
        
        vestingCycles = vestingCycles + daysPast; // @audit-issue we're incrementing a global variable for all receivers, this is silly and has little semantics. As its uint16 it might even overflow pretty quickly!
        lastUnlockTime[_receiver] = block.timestamp; // @audit-issue If you claim after 47 hours, you lose 23 hours due to rounding days down to units of 24 hours.

        emit TransferSent(address(this),_receiver,calTokens); // OK
	}

    function Withdraw() public { // OK
        require(ownedBFG[msg.sender] > 0,"Not WhiteListed or no more tokens to Claim");
        require(lockedBFG[msg.sender] > 0,"no unlocked BFG"); // @audit-issue GAS just checking lockedBFG would be sufficient (REFUTED not raising due to UX value of errors)
      
        //12 months cliff
		if(vestingCycles == 0){
			require(block.timestamp > constUnlockTime + 360 days, "Too early for unlocking tokens"); // OK
			constUnlockTime = constUnlockTime + 360 days; // OK
            vestingCycles ++; //OK
            return; //OK
		}

        //12 month-cliff, linear daily vesting for 24 months (100% -> 720 days -> 0.139%)
		if(vestingCycles > 0){ // @audit-issue GAS remove
            //set unlock time after cliff
            if(lastUnlockTime[msg.sender] == 1665243000){ // OK
                lastUnlockTime[msg.sender] = 1665243000 + 360 days; // @audit-issue why not just put this from the start?
            } // OK
			require(block.timestamp > lastUnlockTime[msg.sender] + 1 days, "Too early for unlock"); //OK
			//need to calculate days
			uint8 daysPast = uint8((block.timestamp - lastUnlockTime[msg.sender]) / 60 / 60 / 24); // @audit-issue uint8 + 1 days => overflow issue!!!
            require(daysPast > 0, "Too early for unlock"); // @audit-issue unnecessary
			getDaysUnlocked(daysPast, msg.sender); //OK
		}
    }

    modifier onlyOwner() { // OK
        require(msg.sender == owner, "Ownable: caller is not the owner"); // OK
        _; // OK
    } // OK

    function transferOwnership(address newOwner) public onlyOwner { // @audit PRIV // @audit-issue EXTERNAL // @audit-issue EVENT
        require(newOwner != address(0), "can't have owner with zero address"); // OK
        owner = newOwner; // OK
    } // OK

}