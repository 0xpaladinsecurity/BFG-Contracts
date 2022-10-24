// SPDX-License-Identifier: MIT
pragma solidity >=0.4.22 <0.9.0;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract PrivateRoundContract {

    uint256 public maxBalance;
    uint256 public balance;
    address public owner;
    address public token;
    uint256 public constUnlockTime;
    uint256 public allOwned;

    IERC20 itoken;
    
    uint16 public vestingCycles;
    mapping(address => uint256) public whiteList;

    mapping(address => uint256) public ownedBFG;
    mapping(address => uint256) public lockedBFG;
    mapping(address => uint256) public lastUnlockTime;

    event TransferSent(address _from,address _destAddr,uint _amount);

        constructor(address _owner, IERC20 _itoken) {
            owner = _owner;
            token = address(_itoken);
            itoken = _itoken;
            //starting 8.10 17:30
            constUnlockTime = 1665243000;
            vestingCycles = 0;
            allOwned = 0;
       }

    function addWhiteList(address user,uint256 amount) public onlyOwner{
        uint256 amountConverted = amount * 1000000000000000000;
        if (balance == 0){
                uint256 _balance = itoken.balanceOf(address(this));
                balance = _balance;
                maxBalance = _balance;
        }
        require(balance > 0,"no BFG available");
        require(amount > 0,"Amount send must be greater than 0");
        require(maxBalance-allOwned >= amountConverted, "not enough BFG available to send.");
        require(ownedBFG[user] == 0, "Already whitelisted");

        //10% TGE
        uint256 TGE = amountConverted * 10 / 100; // @audit-issue unnecessary multiplication
        itoken.transfer(user,TGE); // @audit-issue CEI
        balance-=TGE;

        allOwned += amountConverted;
        ownedBFG[user] += amountConverted;
        lockedBFG[user] += (amountConverted - TGE);
        //starting 8.10 17:30
        lastUnlockTime[user] = 1665243000;

	    whiteList[user] = 1;
        emit TransferSent(address(this),user,TGE);
    }


    function getDaysUnlocked(uint8 daysPast, address _receiver) internal{
        
        //tokens for 1 day
		uint256 newTokens = ownedBFG[_receiver] * 25 / 10000; // OK
		//tokens for daysPast days
		
        //transfer
        require(lockedBFG[_receiver] > 0, "No more tokens for unlock");
        uint256 calTokens = newTokens * daysPast;
        if(calTokens > lockedBFG[_receiver]){
            calTokens = lockedBFG[_receiver];
        }
        itoken.transfer(_receiver,calTokens);
        balance-=calTokens;
        lockedBFG[_receiver] -= calTokens;
        
        vestingCycles = vestingCycles + daysPast;
        lastUnlockTime[_receiver] = block.timestamp;

        emit TransferSent(address(this),_receiver,calTokens);
	}

    function Withdraw() public {
        require(ownedBFG[msg.sender] > 0,"Not WhiteListed or no more tokens to Claim");
        require(lockedBFG[msg.sender] > 0,"no unlocked BFG");
      
        //6 months cliff
		if(vestingCycles == 0){
			require(block.timestamp > constUnlockTime + 180 days , "Too early for unlocking tokens");
			constUnlockTime = constUnlockTime + 180 days;
            vestingCycles ++;
            return;
		}

        //6 month-cliff, linear daily vesting for 12 months (90% -> 360 days -> 0.25%)
		if(vestingCycles > 0){
            //set unlock time after cliff
            if(lastUnlockTime[msg.sender] == 1665243000){
                lastUnlockTime[msg.sender] = 1665243000 + 180 days;
            }

			require(block.timestamp > lastUnlockTime[msg.sender] + 1 days, "Too early for unlock");
			//need to calculate days
			uint8 daysPast = uint8((block.timestamp - lastUnlockTime[msg.sender]) / 60 / 60 / 24);
            require(daysPast > 0, "Too early for unlock");
			getDaysUnlocked(daysPast, msg.sender);
		}
    }

    modifier onlyOwner() {
        require(msg.sender == owner, "Ownable: caller is not the owner");
        _;
    }

    function transferOwnership(address newOwner) public onlyOwner {
        require(newOwner != address(0), "can't have owner with zero address");
        owner = newOwner;
    }

}