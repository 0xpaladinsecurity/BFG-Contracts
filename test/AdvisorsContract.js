const {
  time,
  loadFixture,
} = require("@nomicfoundation/hardhat-network-helpers");
const { anyValue } = require("@nomicfoundation/hardhat-chai-matchers/withArgs");
const { expect } = require("chai");

// CONTRACT DEFINITION FOR COPILOT
// Advisors contract functions:
// - function addWhiteList(address user,uint256 amount) public onlyOwner
// - function Withdraw() public 
//   - emits emit TransferSent(address(this),to,amountConverted);

// Advisors variables:
// - uint256 public maxBalance;
// - uint256 public balance;
// - address public owner;
// - address public token;
// - IERC20 itoken;
// - uint256 public constUnlockTime;
// - uint256 public allOwned; 
// - uint16 public vestingCycles; 
// - mapping(address => uint256) public whiteList; 
// - mapping(address => uint256) public ownedBFG; 
// - mapping(address => uint256) public lockedBFG; 
// - mapping(address => uint256) public lastUnlockTime; 


// Basic properties to test:
// - Ownership should be granted to owner on deployment
// - transferOwnership should be callable exclusively by the owner and properly transfer ownership
// - token should be equal to the address of the token contract
// - addWhiteList should only be callable by owner
// - addWhiteList should coorectly add users to the whitelist
// - addWhiteList should not allow users to be added to the whitelist if they already exist
// - addWhiteList should not allow users to be added to the whitelist if the amount is 0
// - addWhiteList should not allow users to be added to the whitelist if the amount is greater than the maxBalance
// - Withdraw should only be callable if the 1 year lockup period has passed
// - Withdraw should only be callable by whitelisted users
// - Withdraw should only be callable if the user has not withdrawn all of their allocation




describe("AdvisorsContract", function () {
  async function deployAdvisorsFixture() {
    const [owner, alice, bob] = await ethers.getSigners();

    // Deploy new TestToken without a constructor
    const TestToken = await ethers.getContractFactory("TestToken");
    const token = await TestToken.deploy();

    const Advisors = await ethers.getContractFactory("AdvisorsContract");
    const advisors = await Advisors.deploy(owner.address, token.address);

    const totalAllocation = ethers.utils.parseEther("1000000");
    await token.mint(advisors.address, totalAllocation);

    return { advisors, token, owner, alice, bob, totalAllocation };
  }

  describe("Advisors deployment before addWhiteList", function () {
    let advisors, token, owner, alice, bob;

    this.beforeEach(async function () {
      ({ advisors, token, owner, alice, bob } = await loadFixture(
        deployAdvisorsFixture
      ));
    });

    it("Should set the owner to the deployer", async function () {
      expect(await advisors.owner()).to.equal(owner.address);
    });

    it("Should set the token to the deployed token", async function () { 
      expect(await advisors.token()).to.equal(token.address);
    });

    it("Should set the itoken to the deployed token", async function () {
      // use getStorageAt to fetch the itoken value converted to bytes32
      const itoken = await ethers.provider.getStorageAt(
        advisors.address,
        6
      );
      expect(itoken.toString().toLowerCase()).to.equal(ethers.utils.hexZeroPad(token.address, 32).toString().toLowerCase());
    });

    it("Should set the maxBalance to 0", async function () {
      expect(await advisors.maxBalance()).to.equal(0);
    });

    it("Should set the balance to 0", async function () {
      expect(await advisors.balance()).to.equal(0);
    });

    it("Should set the constUnlockTime to 1665243000", async function () {
      expect(await advisors.constUnlockTime()).to.equal(1665243000);
    });
  });

  describe("Adding whitelist", function () {
    let advisors, token, owner, alice, bob, totalAllocation ;

    this.beforeEach(async function () {
      ({ advisors, token, owner, alice, bob, totalAllocation  } = await loadFixture(
        deployAdvisorsFixture
      ));
    });

    it("Should set the maxBalance to totalAllocation", async function () {
      await advisors.addWhiteList(alice.address, 100);
      expect(await advisors.maxBalance()).to.equal(totalAllocation);
    } );

    it("Should not allow non-owner to add to whitelist", async function () {
      await expect(advisors.connect(alice).addWhiteList(alice.address, 100)).to.be.revertedWith("Ownable: caller is not the owner");
    } );

    it("Should allow owner to add to whitelist", async function () {
      await advisors.addWhiteList(alice.address, 100);
      expect(await advisors.whiteList(alice.address)).to.equal(1);
      expect(await advisors.ownedBFG(alice.address)).to.equal(ethers.utils.parseEther("100"));
      expect(await advisors.lockedBFG(alice.address)).to.equal(ethers.utils.parseEther("100"));
      expect(await advisors.lastUnlockTime(alice.address)).to.equal(1665243000);
    } );

    it("Should not allow owner to add to whitelist if user already exists", async function () {
      await advisors.addWhiteList(alice.address, 100);
      await expect(advisors.addWhiteList(alice.address, 100)).to.be.revertedWith("Already whitelisted");
    } );

    it("Should not allow owner to add to whitelist if amount is 0", async function () {
      await expect(advisors.addWhiteList(alice.address, 0)).to.be.revertedWith("Amount send must be greater than 0");
    }
    );

    it("Should not allow owner to add to whitelist if amount is greater than maxBalance", async function () {
      await advisors.addWhiteList(alice.address, 100);
      await expect(advisors.addWhiteList(alice.address, totalAllocation )).to.be.revertedWith("not enough BFG available to send.");
    });

  });

  describe("Withdraw", function () {
    let advisors, token, owner, alice, bob, totalAllocation ;

    this.beforeEach(async function () {
      ({ advisors, token, owner, alice,bob, totalAllocation  } = await loadFixture(
        deployAdvisorsFixture
      ));

      await advisors.addWhiteList(alice.address, 100);
    });

    it("Should not allow non-whitelisted users to withdraw", async function () {
      await expect(advisors.connect(bob).Withdraw()).to.be.revertedWith("Not WhiteListed or no more tokens to Claim");
    } );

    it("Should not allow whitelisted users to withdraw if lockup period has not passed", async function () {
      await expect(advisors.connect(alice).Withdraw()).to.be.revertedWith("Too early for unlocking tokens");
    } );

    it("Should allow whitelisted users to withdraw if lockup period has passed", async function () { // @audit-issue This fails because an overflow occurs.
      // get time that past since timestamp 1665243000 according to getBlock
      await ethers.provider.send("evm_setNextBlockTimestamp", [1665243000 + 359 * 24 * 60 * 60]);
      await ethers.provider.send("evm_mine");
      await expect(advisors.connect(alice).Withdraw()).to.be.revertedWith("Too early for unlocking tokens");

      // Unlock time
      await ethers.provider.send("evm_setNextBlockTimestamp", [1665243000 + 360 * 24 * 60 * 60]);
      await ethers.provider.send("evm_mine", []);

      await advisors.connect(alice).Withdraw();

      await expect(advisors.connect(alice).Withdraw()).to.be.revertedWith("Too early for unlock");

      // Unlock time + 3 days
      await ethers.provider.send("evm_setNextBlockTimestamp", [1665243000 + 363 * 24 * 60 * 60]);
      await ethers.provider.send("evm_mine", []);
      await advisors.connect(alice).Withdraw();

      const unlockedAfter3days = await token.balanceOf(alice.address);

      let pending = ethers.utils.parseEther("100").mul(139).div(100000).mul(3); // @audit-issue note that this uses the bad rounding!
      expect(unlockedAfter3days).to.equal(pending);

      // Unlock time + 1800 days
      await ethers.provider.send("evm_setNextBlockTimestamp", [1665243000 + (360 + 1800) * 24 * 60 * 60]);
      await ethers.provider.send("evm_mine", []);
      await advisors.connect(alice).Withdraw();

      // @audit-issue this overflows and resets the vesting
      expect(await token.balanceOf(alice.address)).to.equal(ethers.utils.parseEther("100"));
    } );


    it("Shouldn't allow users to claim more than expected", async function () {
      await ethers.provider.send("evm_setNextBlockTimestamp", [1665243000 + 360 * 24 * 60 * 60]);
      await ethers.provider.send("evm_mine", []);

      await advisors.connect(alice).Withdraw();

      for (let i = 0; i < 7; i++) {
        await ethers.provider.send("evm_increaseTime", [100 * 24 * 60 * 60]);
        await ethers.provider.send("evm_mine", []);
        await advisors.connect(alice).Withdraw();
      }

      // 5 day before the end
      await ethers.provider.send("evm_increaseTime", [15 * 24 * 60 * 60]);
      await ethers.provider.send("evm_mine", []);
      await advisors.connect(alice).Withdraw();

      expect(await token.balanceOf(alice.address)).to.be.lt(ethers.utils.parseEther("100"));

      await ethers.provider.send("evm_increaseTime", [120]);
      await ethers.provider.send("evm_mine", []);
      await expect(advisors.connect(alice).Withdraw()).to.be.revertedWith("Too early for unlock");


      await ethers.provider.send("evm_increaseTime", [50 * 24 * 60 * 60]);
      await ethers.provider.send("evm_mine", []);
      await advisors.connect(alice).Withdraw();

      expect(await token.balanceOf(alice.address)).to.equal(ethers.utils.parseEther("100"));

      await expect(advisors.connect(alice).Withdraw()).to.be.revertedWith("no unlocked BFG");
    });

    it("It will increase the vesting schedule when claiming every 47 hours", async function () {
      await ethers.provider.send("evm_setNextBlockTimestamp", [1665243000 + 360 * 24 * 60 * 60]);
      await ethers.provider.send("evm_mine", []);

      await advisors.connect(alice).Withdraw();

      const oneDayUnlock = ethers.utils.parseEther("100").mul(139).div(100000)

      let previousBalance = await token.balanceOf(alice.address);
      let nextBalance = await token.balanceOf(alice.address);
      for (let i = 0; i < 20; i++) {
        await ethers.provider.send("evm_increaseTime", [47 * 60 * 60]);
        await ethers.provider.send("evm_mine", []);

        await advisors.connect(alice).Withdraw();
        nextBalance = await token.balanceOf(alice.address);

        expect(nextBalance).to.equal(previousBalance.add(oneDayUnlock));
        previousBalance = nextBalance;
      }

      const dayPassed = Math.round(20 * 47 / 24);
      const actualDayUnlocked = 20 
      expect(await token.balanceOf(alice.address)).to.be.lt(oneDayUnlock.mul(dayPassed));
      expect(await token.balanceOf(alice.address)).to.equal(oneDayUnlock.mul(actualDayUnlocked));

    });

    
  });
});
