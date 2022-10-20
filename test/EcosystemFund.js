const {
  time,
  loadFixture,
} = require("@nomicfoundation/hardhat-network-helpers");
const { anyValue } = require("@nomicfoundation/hardhat-chai-matchers/withArgs");
const { expect } = require("chai");

// CONTRACT DEFINITION FOR COPILOT
// Ecosystem Fund contract functions:
// - constructor(address _owner, IERC20 _itoken) 
// - function init() public onlyOwner
// - function Withdraw(address _address, uint256 amount) public onlyOwner // amount is multiplied by 1e18 within function
//   - emits emit TransferSent(address(this),to,amountConverted);
// - function transferOwnership(address newOwner) public onlyOwner

// Ecosystem variables:
// - uint256 public maxBalance;
// - uint256 public balance;
// - address public owner;
// - address public token;
// - uint256 public lastUnlockTime;
// - IERC20 itoken;
// - uint16 public vestingCycles;

// Basic properties to test:
// - Ownership should be granted to owner on deployment
// - init should only be callable by owner
// - init should only be callable once
// - init should set lastUnlocktime to the correct timestamp
// - transferOwnership should be callable exclusively by the owner and properly transfer ownership
// - token and itoken should be equal to the address of the token contract

// Any withdrawals before 1665243000 will revert.

describe("EcosystemFund Contract", function () {
  async function deployEcosystemFixture() {
    const [owner, otherAccount] = await ethers.getSigners();

    // Deploy new TestToken without a constructor
    const TestToken = await ethers.getContractFactory("TestToken");
    const token = await TestToken.deploy();

    const EcosystemFund = await ethers.getContractFactory("EcosystemFundContract");
    const fund = await EcosystemFund.deploy(owner.address, token.address);

    return { fund, token, owner, otherAccount };
  }

  describe("EcoSystem deployment before init", function () {
    let fund, token, owner, otherAccount;

    this.beforeEach(async function () {
      ({ fund, token, owner, otherAccount } = await loadFixture(
        deployEcosystemFixture
      ));
    });

    it("Should set the owner to the deployer", async function () {
      expect(await fund.owner()).to.equal(owner.address);
    });

    it("Should set the token to the deployed token", async function () {
      expect(await fund.token()).to.equal(token.address);
    });

    it("Should set the itoken to the deployed token", async function () { // @audit-issue itoken is private
      // use getStorageAt to fetch the itoken value converted to bytes32
      const itoken = await ethers.provider.getStorageAt(
        fund.address,
        5
      );
      expect(itoken.toString().toLowerCase()).to.equal(ethers.utils.hexZeroPad(token.address, 32).toString().toLowerCase());
    });

    it("Should set the maxBalance to 0", async function () {
      expect(await fund.maxBalance()).to.equal(0);
    });

    it("Should set the balance to 0", async function () {
      expect(await fund.balance()).to.equal(0);
    });

    it("Should set the lastUnlockTime to 1665243000", async function () { // @audit-issue Why?
      expect(await fund.lastUnlockTime()).to.equal(1665243000);
    });

    it("Should set the vestingCycles to 0", async function () { // @audit-issue why?
      expect(await fund.vestingCycles()).to.equal(0);
    });

    it("Should revert when init is called by non-owner", async function () {
      await expect(fund.connect(otherAccount).init()).to.be.revertedWith(
        "Ownable: caller is not the owner"
      );
    });

    it("Should revert when init is called twice", async function () { // @audit-issue init can be called twice
      await fund.init();
      await expect(fund.init()).to.be.revertedWith(
        "EcosystemFund: Already initialized"
      );
    });

    it("Should revert when withdraw is called by non-owner", async function () {
      await expect(
        fund.connect(otherAccount).Withdraw(otherAccount.address, 100)
      ).to.be.revertedWith("Ownable: caller is not the owner");
    });

    it("Should revert when transferOwnership is called by non-owner", async function () {
      await expect(
        fund.connect(otherAccount).transferOwnership(otherAccount.address)
      ).to.be.revertedWith("Ownable: caller is not the owner");
    });

    it("Should allow transferOwnership to be called by owner", async function () {
      await expect(
        fund.transferOwnership(otherAccount.address)
      ).to.not.be.reverted;
      await expect(await fund.owner()).to.equal(otherAccount.address);
    });

    it("Should allow init to be called by owner", async function () {
      await expect(fund.init()).to.not.be.reverted;
    });

    it("Should set maxBalance to the token balance after init", async function () {
      await token.mint(fund.address, 100);
      await fund.init();
      expect(await fund.maxBalance()).to.equal(100);
      expect(await fund.balance()).to.equal(100);
    });
  });

  describe("EcosystemFund deployment and initialized with 100 tokens", function () {
    let fund, token, owner, otherAccount;

    this.beforeEach(async function () {
      ({ fund, token, owner, otherAccount } = await loadFixture(
        deployEcosystemFixture
      ));
      // ethers 100 tokens in 1e18 as bignumber
      await token.mint(fund.address, ethers.utils.parseEther("100"));
      await fund.init();
    });

    it("Should have balance and maxBalance set to 100 tokens", async function () {
      expect(await fund.maxBalance()).to.equal(ethers.utils.parseEther("100"));
      expect(await fund.balance()).to.equal(ethers.utils.parseEther("100"));
    });

    it("Should not allow withdraw to be called by non-owner", async function () {
      await expect(
        fund.connect(otherAccount).Withdraw(otherAccount.address, 1)
      ).to.be.revertedWith("Ownable: caller is not the owner");
    });
  });
});
