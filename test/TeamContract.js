const {
  time,
  loadFixture,
} = require("@nomicfoundation/hardhat-network-helpers");
const { anyValue } = require("@nomicfoundation/hardhat-chai-matchers/withArgs");
const { expect } = require("chai");

// CONTRACT DEFINITION FOR COPILOT
// TeamContract contract functions:
// - constructor(address _owner,uint8 share,IERC20 _itoken)
// - function init() public onlyOwner
// - function AddMember(address member,uint8 share)
// - function WithdrawToMember()
// - function Unlock()
// - function transferOwnership(address newOwner) public onlyOwner

// Ecosystem variables:
// - uint256 public maxBalance;
// - uint256 public balance;
// - address public owner;
// - address public bfgTokenAddress;
// - uint256 public lastUnlockTime;
// - IERC20 itoken;
// - uint public vestingCycles;
// - mapping(address => uint8) public shares; 
// - mapping(address => uint256) public balances;
// - address[] public members;
// - uint8 public totalShares = 0;
// - uint8 public memberLength = 7;

// Basic properties to test:
// - Ownership should be granted to owner on deployment
// - init should only be callable by owner
// - init should only be callable once
// - init should set lastUnlocktime to the correct timestamp
// - transferOwnership should be callable exclusively by the owner and properly transfer ownership
// - token and itoken should be equal to the address of the token contract
// - contract initializes with the owner as the only member with 100% of the shares and the configured share value (10) and totalShares = 10.
// - AddMember should only be callable by the owner
// - AddMember should only be callable once per member
// - AddMember should only be callable if the sum of all shares is less than 100
// - AddMember should add the member to the members array
// - AddMember should add the member to the shares mapping
// - Members should have a zero balance by default in the balances mapping.
// - WithdrawToMember should only be callable by members
// - WithdrawToMember should only be callable if the member has a non-zero balance

describe("TeamContract Contract", function () {
  async function deployFixture() {
    const [owner, alice, bob] = await ethers.getSigners();

    // Deploy new TestToken without a constructor
    const TestToken = await ethers.getContractFactory("TestToken");
    const token = await TestToken.deploy();

    const TeamContract = await ethers.getContractFactory("TeamContract");
    const contract = await TeamContract.deploy(owner.address, 10, token.address); // We give the owner 10% of the total shares at deployment.

    return { contract, token, owner, alice, bob };
  }

  describe("TeamContract deployment before init", function () {
    let contract, token, owner, alice, bob;

    this.beforeEach(async function () {
      ({ contract, token, owner, alice, bob } = await loadFixture(
        deployFixture
      ));
    });

    it("Should set the owner to the deployer", async function () {
      expect(await contract.owner()).to.equal(owner.address);
    });

    it("Should set the token to the deployed token", async function () {
      expect(await contract.bfgTokenAddress()).to.equal(token.address);
    });

    it("Should set the itoken to the deployed token", async function () { // @audit-issue itoken is private
      // use getStorageAt to fetch the itoken value converted to bytes32
      const itoken = await ethers.provider.getStorageAt(
        contract.address,
        4
      );
      expect(itoken.toString().toLowerCase()).to.equal(ethers.utils.hexZeroPad(token.address, 32).toString().toLowerCase());
    });

    it("Should set the maxBalance to 0", async function () {
      expect(await contract.maxBalance()).to.equal(0);
    });

    it("Should set the balance to 0", async function () {
      expect(await contract.balance()).to.equal(0);
    });

    it("Should set the lastUnlockTime to 1665243000", async function () {
      expect(await contract.lastUnlockTime()).to.equal(1665243000);
    });

    it("Should set the vestingCycles to 0", async function () {
      expect(await contract.vestingCycles()).to.equal(0);
    });

    it("Should revert when init is called by non-owner", async function () {
      await expect(contract.connect(alice).init()).to.be.revertedWith(
        "Ownable: caller is not the owner"
      );
    });

    it("Should revert when init is called twice", async function () { // @audit-issue init can be called twice
      await contract.init();
      await expect(contract.init()).to.be.revertedWith(
        "Ecosystemcontract: Already initialized"
      );
    });

    it("Should revert when Unlock is called by non-member", async function () {
      await expect(
        contract.connect(alice).Unlock()
      ).to.be.revertedWith("Only members");
    });

    it("Should revert when transferOwnership is called by non-owner", async function () {
      await expect(
        contract.connect(alice).transferOwnership(alice.address)
      ).to.be.revertedWith("Ownable: caller is not the owner");
    });

    it("Should allow transferOwnership to be called by owner", async function () {
      await expect(
        contract.transferOwnership(alice.address)
      ).to.not.be.reverted;
      await expect(await contract.owner()).to.equal(alice.address);
    });

    it("Should allow init to be called by owner", async function () {
      await expect(contract.init()).to.not.be.reverted;
    });

    it("Should set maxBalance to the token balance after init", async function () {
      await token.mint(contract.address, 100);
      await contract.init();
      expect(await contract.maxBalance()).to.equal(100);
      expect(await contract.balance()).to.equal(100);
    });
  });

  describe("TeamContract deployment and initialized with 100 tokens", function () {
    let contract, token, owner, alice, bob;

    this.beforeEach(async function () {
      ({ contract, token, owner, alice, bob } = await loadFixture(
        deployFixture
      ));
      // ethers 100 tokens in 1e18 as bignumber
      await token.mint(contract.address, ethers.utils.parseEther("100"));
      await contract.init();
    });

    it("Should have balance and maxBalance set to 100 tokens", async function () {
      expect(await contract.maxBalance()).to.equal(ethers.utils.parseEther("100"));
      expect(await contract.balance()).to.equal(ethers.utils.parseEther("100"));
    });

    it("Should not allow Unlock to be called by non-member", async function () {
      await expect(
        contract.connect(alice).Unlock()
      ).to.be.revertedWith("Only members");
    });



    it("Should revert Unlock to if not 100% shares", async function () {
      await expect(contract.Unlock()).to.be.revertedWith("Need 100% shares added to start Unlock");
    });

    it("Should set owner as the only member with 100% of the shares and the configured share value (10) and totalShares = 10", async function () {
      expect(await contract.members(0)).to.equal(owner.address);
      expect(await contract.shares(owner.address)).to.equal(10);
      expect(await contract.totalShares()).to.equal(10);
      await expect(contract.members(1)).to.be.reverted;
    });

    it("Should allow AddMember to be called by owner", async function () {
      await expect(contract.AddMember(alice.address, 5)).to.not.be.reverted;
      // validate addition
      expect(await contract.members(0)).to.equal(owner.address);
      expect(await contract.members(1)).to.equal(alice.address);
      expect(await contract.shares(alice.address)).to.equal(5);
      expect(await contract.totalShares()).to.equal(15);
      await expect(contract.members(2)).to.be.reverted;
    });
    
    it("Should not allow addMember to be called twice for the same member", async function () {
      await contract.AddMember(alice.address, 5);
      await expect(contract.AddMember(alice.address, 5)).to.be.revertedWith("Member already added");
    });

    it("Should not allow addMember to be called if the sum of all shares is greater than 100", async function () {
      await expect(contract.AddMember(alice.address, 85)).to.not.be.reverted;
      await expect(contract.AddMember(bob.address, 6)).to.be.revertedWith("Share percentage exceeds 100%");
    });

    it("Should allow addMember to be called with a sum up to 100", async function () {
      await expect(contract.AddMember(alice.address, 85)).to.not.be.reverted;
      await expect(contract.AddMember(bob.address, 5)).to.not.be.reverted;
      expect(await contract.totalShares()).to.equal(100);
    });
    it("Should not allow WithdrawToMember to be called by non-member", async function () {
      await expect(
        contract.connect(alice).WithdrawToMember()
      ).to.be.revertedWith("Only members");
    });

    it("Should not allow WithdrawToMember to be called if the member has a zero balance", async function () {
      await expect(
        contract.WithdrawToMember()
      ).to.be.revertedWith("Not enough unlocked tokens");
    });

    it("Should give members a zero balance by default", async function () {
      expect(await contract.balances(owner.address)).to.equal(0);
    });
    
    it("Should not allow Unlock to be called before 360 days have passed", async function () {
      await contract.AddMember(alice.address, 90);
      await expect(contract.Unlock()).to.be.revertedWith("Too early for unlocking tokens");
      // wait until 359 days passed since 1665243000 and try again
      // use setTime
      await ethers.provider.send("evm_setNextBlockTimestamp", [1665243000 + 360 * 24 * 60 * 60  - 24 * 60 * 60]);
      await ethers.provider.send("evm_mine");
      await expect(contract.Unlock()).to.be.revertedWith("Too early for unlocking tokens");
      // wait one more day, it should work
      await ethers.provider.send("evm_setNextBlockTimestamp", [1665243000 + 360 * 24 * 60 * 60]);
      await ethers.provider.send("evm_mine");
      await expect(contract.Unlock()).to.not.be.reverted;
    });

    // describe a setup where we add alice as a 90% share receiver and increase the time to an unlockable time and unlock once
    describe("Setup with alice as 90% share receiver and unlock once", function () {
      this.beforeEach(async function () {
        await contract.AddMember(alice.address, 90);
        await ethers.provider.send("evm_setNextBlockTimestamp", [1665243000 + 360 * 24 * 60 * 60]);
        await ethers.provider.send("evm_mine");
        await expect(contract.Unlock()).to.not.be.reverted;
      });

      it("Should not allow Unlock to be called before anoter day has passed", async function () {
        await expect(contract.Unlock()).to.be.revertedWith("Too early for unlocking tokens");
        // wait a full day using increase timestamp
        await ethers.provider.send("evm_increaseTime", [24 * 60 * 60]);
        await ethers.provider.send("evm_mine");
        await expect(contract.Unlock()).to.not.be.reverted;
      });

      describe("With a day passed and another unlock call", function () {
        let [total, aliceBal, ownerBal ] = [];
        this.beforeEach(async function () {
          total = ethers.utils.parseEther("100").mul(104).div(100000);
          [aliceBal, ownerBal] = [total.mul(90).div(100), total.mul(10).div(100)];
          await ethers.provider.send("evm_increaseTime", [24 * 60 * 60]);
          await ethers.provider.send("evm_mine");
          await expect(contract.Unlock()).to.not.be.reverted;
        });

        it("Users should have a balance", async function () { // start with "100" tokens, 1 day passes, 0.104% per day is granted => 0.104 tokens split 10% to owner and 90% to alice
          expect(await contract.balances(owner.address)).to.equal(ownerBal);
          expect(await contract.balances(alice.address)).to.equal(aliceBal);
        });

        it("Should allow users to claim their balance, transferring tokens from contract and resetting the balance", async function () {
          const tokenBalBefore = await token.balanceOf(owner.address);
          const contractBalBefore = await token.balanceOf(contract.address);
          expect(await contract.balances(owner.address)).to.equal(ownerBal);
          await expect(contract.WithdrawToMember()).to.not.be.reverted;
          const tokenBalAfter = await token.balanceOf(owner.address);
          const contractBalAfter = await token.balanceOf(contract.address);
          expect(await contract.balances(owner.address)).to.equal(0);
          expect(await contract.balances(alice.address)).to.equal(aliceBal);
          expect(await contract.balance()).to.equal(ethers.utils.parseEther("100").sub(ownerBal).sub(aliceBal));
          expect(tokenBalAfter.sub(tokenBalBefore)).to.equal(ownerBal);
          expect(contractBalBefore.sub(contractBalAfter)).to.equal(ownerBal);

          // test another claim by owner and nothing should have changed
          await expect(contract.WithdrawToMember()).to.be.revertedWith("Not enough unlocked tokens");

          // Claim for alice
          const tokenBalBefore2 = await token.balanceOf(alice.address);
          const contractBalBefore2 = await token.balanceOf(contract.address);
          expect(await contract.balances(alice.address)).to.equal(aliceBal);
          await expect(contract.connect(alice).WithdrawToMember()).to.not.be.reverted;
          const tokenBalAfter2 = await token.balanceOf(alice.address);
          const contractBalAfter2 = await token.balanceOf(contract.address);
          expect(await contract.balances(owner.address)).to.equal(0);
          expect(await contract.balances(alice.address)).to.equal(0);
          expect(await contract.balance()).to.equal(ethers.utils.parseEther("100").sub(ownerBal).sub(aliceBal));
          expect(tokenBalAfter2.sub(tokenBalBefore2)).to.equal(aliceBal);
          expect(contractBalBefore2.sub(contractBalAfter2)).to.equal(aliceBal);
        });

      // let 3 days pass
      describe("With until another 3 days passed and another unlock call", function () {
        this.beforeEach(async function () {
          total = ethers.utils.parseEther("100").mul(4).mul(104).div(100000);
          [aliceBal, ownerBal ] = [total.mul(90).div(100), total.mul(10).div(100)];
          await ethers.provider.send("evm_increaseTime", [3 * 24 * 60 * 60]);
          await ethers.provider.send("evm_mine");
          await expect(contract.Unlock()).to.not.be.reverted;
          await expect(contract.Unlock()).to.not.be.reverted; // @audit-issue HIGH OVERFLOW PANIC!
        });

        it("Users should have a balance", async function () { // start with "100" tokens, 3 days passes, 0.312% per day is granted => 0.312 tokens split 10% to owner and 90% to alice
          expect(await contract.balances(owner.address)).to.equal(ownerBal);
          expect(await contract.balances(alice.address)).to.equal(aliceBal);
        });
      });

      describe("With until another 1 days passed and another unlock call", function () {
        this.beforeEach(async function () {
          total = ethers.utils.parseEther("100").mul(2).mul(104).div(100000);
          [aliceBal, ownerBal ] = [total.mul(90).div(100), total.mul(10).div(100)];
          await ethers.provider.send("evm_increaseTime", [1 * 24 * 60 * 60]);
          await ethers.provider.send("evm_mine");
          await expect(contract.Unlock()).to.not.be.reverted;
          await expect(contract.Unlock()).to.be.revertedWith("Too early for unlocking tokens");
        });

        it("Users should have a balance", async function () { // start with "100" tokens, 3 days passes, 0.312% per day is granted => 0.312 tokens split 10% to owner and 90% to alice
          expect(await contract.balances(owner.address)).to.equal(ownerBal);
          expect(await contract.balances(alice.address)).to.equal(aliceBal);
        });

        it("Should allow users to claim their balance, transferring tokens from contract and resetting the balance", async function () {
          const tokenBalBefore = await token.balanceOf(owner.address);
          const contractBalBefore = await token.balanceOf(contract.address);
          expect(await contract.balances(owner.address)).to.equal(ownerBal);
          await expect(contract.WithdrawToMember()).to.not.be.reverted;
          const tokenBalAfter = await token.balanceOf(owner.address);
          const contractBalAfter = await token.balanceOf(contract.address);
          expect(await contract.balances(owner.address)).to.equal(0);
          expect(await contract.balances(alice.address)).to.equal(aliceBal);
          expect(await contract.balance()).to.equal(ethers.utils.parseEther("100").sub(ownerBal).sub(aliceBal));
          expect(tokenBalAfter.sub(tokenBalBefore)).to.equal(ownerBal);
          expect(contractBalBefore.sub(contractBalAfter)).to.equal(ownerBal);

          // test another claim by owner and nothing should have changed
          await expect(contract.WithdrawToMember()).to.be.revertedWith("Not enough unlocked tokens");

          // Claim for alice
          const tokenBalBefore2 = await token.balanceOf(alice.address);
          const contractBalBefore2 = await token.balanceOf(contract.address);
          expect(await contract.balances(alice.address)).to.equal(aliceBal);
          await expect(contract.connect(alice).WithdrawToMember()).to.not.be.reverted;
          const tokenBalAfter2 = await token.balanceOf(alice.address);
          const contractBalAfter2 = await token.balanceOf(contract.address);
          expect(await contract.balances(owner.address)).to.equal(0);
          expect(await contract.balances(alice.address)).to.equal(0);
          expect(await contract.balance()).to.equal(ethers.utils.parseEther("100").sub(ownerBal).sub(aliceBal));
          expect(tokenBalAfter2.sub(tokenBalBefore2)).to.equal(aliceBal);
          expect(contractBalBefore2.sub(contractBalAfter2)).to.equal(aliceBal);
          
          // wait another day and try to claim again
          await ethers.provider.send("evm_increaseTime", [1 * 24 * 60 * 60]);
          await ethers.provider.send("evm_mine");
          await expect(contract.WithdrawToMember()).to.be.revertedWith("Not enough unlocked tokens");
          // unlock
          await expect(contract.Unlock()).to.not.be.reverted;
          // logic
          total = ethers.utils.parseEther("100").mul(1).mul(104).div(100000);
          [aliceBal, ownerBal ] = [total.mul(90).div(100), total.mul(10).div(100)];

          const tokenBalBefore3 = await token.balanceOf(owner.address);
          const contractBalBefore3 = await token.balanceOf(contract.address);
          expect(await contract.balances(owner.address)).to.equal(ownerBal);
          await expect(contract.WithdrawToMember()).to.not.be.reverted;
          const tokenBalAfter3 = await token.balanceOf(owner.address);
          const contractBalAfter3 = await token.balanceOf(contract.address);
          expect(await contract.balances(owner.address)).to.equal(0);
          expect(await contract.balances(alice.address)).to.equal(aliceBal);
          expect(await contract.balance()).to.equal(ethers.utils.parseEther("100").sub(ownerBal.mul(3)).sub(aliceBal.mul(3)));
          expect(tokenBalAfter3.sub(tokenBalBefore3)).to.equal(ownerBal);
          expect(contractBalBefore3.sub(contractBalAfter3)).to.equal(ownerBal);
        });
      });
    });
    });
  });
});
