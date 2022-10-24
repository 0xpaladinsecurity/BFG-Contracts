// SPDX-License-Identifier: MIT
pragma solidity >=0.4.22 <0.9.0; // @audit-issue PRAGMA DONE 

import "@openzeppelin/contracts/token/ERC20/ERC20.sol"; // @audit-issue TYPO IERC20 DONE 

contract TeamContract {
    uint256 public maxBalance; // @audit no longer accounting variable, used within the calculation logic
    uint256 public balance; // OK
    uint256 public lastUnlockTime; // OK
    address public owner; // @audit-issue move to Ownable DONE 
    IERC20 itoken; // @audit-issue PRIVATE DONE
    address public bfgTokenAddress; // @note same as itoken
    mapping(address => uint8) public shares; // @note share-based distribution to members // @audit-issue use uint256 DONE
    mapping(address => uint256) public balances; // @note Pending balance which can be harvested through WithdrawToMember
    address[] public members; // @audit-issue TYPO: No length function DONE
    uint public vestingCycles; // OK
    uint8 public totalShares = 0; // @note sum of all shares
    uint8 public memberLength = 7;

event TransferSent(address _from,address _destAddr,uint _amount);


       constructor(address _owner,uint8 share,IERC20 _itoken) {
            itoken = _itoken; // OK
            bfgTokenAddress = address(itoken); // OK
            owner = _owner; // OK
            members.push(_owner); // @note Owner is immediatelly added to the members list
            totalShares = share; // @audit-issue don't repeat yourself, consider calling an internal _addMember instead
            shares[_owner] = share;
            lastUnlockTime = 1665243000; // @audit-issue MOVE to top
            vestingCycles = 0; // @audit-issue UNNECESSARY
       }

    function init() public onlyOwner{
        if(maxBalance==0){
            maxBalance = itoken.balanceOf(address(this));
        }
        balance = itoken.balanceOf(address(this));
    }

    function AddMember(address member,uint8 share) public onlyOwner{ // @audit PRIV // @audit-issue EVENT DONE // @audit-issue EXTERNAL DONE // @audit-issue TYPO `addMembers` DONE // @audit-issue TYPO uint8 IN the share variable
        require(vestingCycles == 0, "Changes not allowed after vesting starts"); // OK Can't have called unlock at all
        require(share > 0 , "Shares must be positive numbers"); // OK
        require(shares[member] == 0, "Member already added"); // OK
        require(members.length <= memberLength-1,"All team members added"); // @audit-issue GAS do members.length < memberLength. DONE
        require(share+totalShares <= 100, "Share percentage exceeds 100%"); 

        shares[member] = share; // @audit-issue if the harvest is not rewarding in hindsight to new members, we should call Unlock() here first REFUTED
        totalShares += share; // OK
        members.push(member); // OK
    }

    //function RemoveMember(uint index, address _address) public onlyOwner{ // @audit-issue TYPO remove unused code DONE
    //    require(vestingCycles == 0, "Changes not allowed after vesting starts");
    //    require(index <= members.length,"Not a valid user");
    //    require(members[index] == _address, "Address not complatible with index");
    //    totalShares -= shares[_address];
    //    shares[_address] = 0;
    //    members[index] = members[members.length - 1];
    //    members.pop();   
    //}

    //withdraw tokens 
    function WithdrawToMember() public onlyMember{ // @audit-issue EXTERNAL // @audit-issue TYPO `withdrawToMember` // @audit-issue TYPO rename to "claim"
        require(balances[msg.sender] > 0,"Not enough unlocked tokens"); // OK
        
        itoken.transfer(msg.sender,balances[msg.sender]);
        balances[msg.sender] = 0; // @audit-issue CEI

        emit TransferSent(address(this),msg.sender,balances[msg.sender]);
    }

    //unlock vested tokens if ready
    function Unlock() public onlyMember{ // @audit PRIV [ member ] // @audit-issue EXTERNAL // @audit-issue EVENT DONE
        
        require(totalShares == 100, "Need 100% shares added to start Unlock");
        
        if (maxBalance <= 0){ // @audit-issue should be == 
            uint256 newBalance = itoken.balanceOf(address(this));
            maxBalance = newBalance;
        }

        //12 months cliff
        if (vestingCycles == 0){ // @note need to wait a day after the first unlock.
            require(block.timestamp > lastUnlockTime + 360 days,"Too early for unlocking tokens");
            calc(0, 360 days); // @note always increments the cycle with one and lastUnlockTime with a year
            return; // OK
        }

        if (balance <= 0){ // @audit-issue uint, just check ==. DONE
            uint256 newBalance = itoken.balanceOf(address(this));
            balance = newBalance;
        }
        //unlock 3.5% each month // @audit-issue TYPO its more like 3.125%
        // unlock 0,104% linear daily 32 months (100%) (960 days)
        if (vestingCycles > 0){ // @note unnecessary if statement.
            if(lastUnlockTime == 1665243000){ // @audit-issue UNREACHABLE DONE
                lastUnlockTime= 1665243000 + 360 days;
            }
            require(block.timestamp > lastUnlockTime + 1 days, "Too early for unlocking tokens");
            uint8 daysPast = uint8((block.timestamp - lastUnlockTime) / 60 / 60 / 24); // @audit-issue MED uint8 (uint16 x!!) => use uint256! // @audit-issue Precision, if you wait 47 hours, you claim for 1 day but lose the remaining 23 hours. TeamContract will slowly drift away from the expected emission rate to a lower value if claims are frequent but not hyper frequent. REFUTED: They only catch up with the days that have passed since
            require(daysPast > 0, "Too early for unlock"); 
            
            calc(104 * daysPast, daysPast * 1 days);// @audit-issue HIGH claiming will fail completely after 3 days pass because 104 * daysPassed overflows within a uint8 space.
        }
    }
    
    function calc(uint16 x,uint256 y) internal{ // x = 104 * daysPast, y = daysPast * 1 days // @audit-issue TYPO cryptic function, parameters should just be (uint256 daysPast). DONE
            require(balance > 0, "No more tokens for unlock");
            if(x > 0){ // @note if vestingCycles != 0 (indirectly)
                uint256 newTokens = maxBalance * x / 100000; // 0.104% per day of maxBalance
                if(newTokens > balance){ 
                    newTokens = balance;
                }
                for (uint8 i = 0; i < members.length; i++) { // @audit-issue GAS cache members.length! Also no uint8!
                    uint256 memberTokens = shares[members[i]] * newTokens / 100; // @audit-issue TYPO magic value
                    balances[members[i]] += memberTokens;
                }
                balance -= newTokens;
                lastUnlockTime += y;
                vestingCycles += x/104;
            }
            if(x==0){ // @audit-issue ELSE DONE
                lastUnlockTime += y; // OK
                vestingCycles ++; // OK
            }
    }

    modifier onlyMember() { // @audit-issue MOVE to top
         require(shares[msg.sender] > 0,"Only members"); // OK
        _; // OK
    } // OK

    modifier onlyOwner() { // @audit-issue MOVE TO TOP
        require(msg.sender == owner, "Ownable: caller is not the owner"); // OK
        _; // OK
    } // OK

    function transferOwnership(address newOwner) public onlyOwner { // @audit-issue EXTERNAL // @audit-issue EVENT
        require(newOwner != address(0), "can't have owner with zero address"); // OK
        owner = newOwner; // OK
    }

}