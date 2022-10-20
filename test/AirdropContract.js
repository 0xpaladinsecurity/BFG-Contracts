const {
  time,
  loadFixture,
} = require("@nomicfoundation/hardhat-network-helpers");
const { anyValue } = require("@nomicfoundation/hardhat-chai-matchers/withArgs");
const { expect } = require("chai");

// CONTRACT DEFINITION FOR COPILOT
// Airdrop contract functions:
// - function init() public onlyOwner
// - function allocate(address to, uint256 amount) public onlyOwner // input amount is multiplied by 1e18!
//   - emits emit TransferSent(address(this),to,amountConverted);
// - function transferOwnership(address newOwner) public onlyOwner

// Airdrop variables:
// - uint256 public maxBalance;
// - uint256 public balance;
// - address public owner;
// - address public token;
// - IERC20 itoken;

// Basic properties to test:
// - Ownership should be granted to owner on deployment
// - init should only be callable by owner
// - init should only be callable once
// - init should set maxBalance to the tokens present in the contract
// - transferOwnership should be callable exclusively by the owner and properly transfer ownership
// - token should be equal to the address of the token contract

describe("AirdropContract", function () {
  async function deployAirdropFixture() {
    const [owner, otherAccount] = await ethers.getSigners();

    // Deploy new TestToken without a constructor
    const TestToken = await ethers.getContractFactory("TestToken");
    const token = await TestToken.deploy();

    const Airdrop = await ethers.getContractFactory("AirdropFundContract");
    const airdrop = await Airdrop.deploy(owner.address, token.address);

    return { airdrop, token, owner, otherAccount };
  }

  describe("Airdrop deployment before init", function () {
    let airdrop, token, owner, otherAccount;

    this.beforeEach(async function () {
      ({ airdrop, token, owner, otherAccount } = await loadFixture(
        deployAirdropFixture
      ));
    });

    it("Should set the owner to the deployer", async function () {
      expect(await airdrop.owner()).to.equal(owner.address);
    });

    it("Should set the token to the deployed token", async function () { // @audit-issue token is never set
      expect(await airdrop.token()).to.equal(token.address);
    });

    it("Should set the itoken to the deployed token", async function () { // @audit-issue itoken is private
      // use getStorageAt to fetch the itoken value converted to bytes32
      const itoken = await ethers.provider.getStorageAt(
        airdrop.address,
        4
      );
      expect(itoken.toString().toLowerCase()).to.equal(ethers.utils.hexZeroPad(token.address, 32).toString().toLowerCase());
    });

    it("Should set the maxBalance to 0", async function () {
      expect(await airdrop.maxBalance()).to.equal(0);
    });

    it("Should set the balance to 0", async function () {
      expect(await airdrop.balance()).to.equal(0);
    });

    it("Should revert when init is called by non-owner", async function () {
      await expect(airdrop.connect(otherAccount).init()).to.be.revertedWith(
        "Ownable: caller is not the owner"
      );
    });

    it("Should revert when init is called twice", async function () { // @audit-issue init can be called twice
      await airdrop.init();
      await expect(airdrop.init()).to.be.revertedWith(
        "AirdropFundContract: Already initialized"
      );
    });

    it("Should revert when allocate is called by non-owner", async function () {
      await expect(
        airdrop.connect(otherAccount).allocate(otherAccount.address, 100)
      ).to.be.revertedWith("Ownable: caller is not the owner");
    });

    it("Should revert when transferOwnership is called by non-owner", async function () {
      await expect(
        airdrop.connect(otherAccount).transferOwnership(otherAccount.address)
      ).to.be.revertedWith("Ownable: caller is not the owner");
    });

    it("Should allow transferOwnership to be called by owner", async function () {
      await expect(
        airdrop.transferOwnership(otherAccount.address)
      ).to.not.be.reverted;
      await expect(await airdrop.owner()).to.equal(otherAccount.address);
    });

    it("Should allow init to be called by owner", async function () {
      await expect(airdrop.init()).to.not.be.reverted;
    });

    it("Should set maxBalance to the token balance after init", async function () {
      await token.mint(airdrop.address, 100);
      await airdrop.init();
      expect(await airdrop.maxBalance()).to.equal(100);
      expect(await airdrop.balance()).to.equal(100);
    });
  });

  describe("Airdrop deployment and initialized with 100 tokens", function () {
    let airdrop, token, owner, otherAccount;

    this.beforeEach(async function () {
      ({ airdrop, token, owner, otherAccount } = await loadFixture(
        deployAirdropFixture
      ));
      // ethers 100 tokens in 1e18 as bignumber
      await token.mint(airdrop.address, ethers.utils.parseEther("100"));
      await airdrop.init();
    });

    it("Should have balance and maxBalance set to 2 tokens", async function () {
      expect(await airdrop.maxBalance()).to.equal(ethers.utils.parseEther("100"));
      expect(await airdrop.balance()).to.equal(ethers.utils.parseEther("100"));
    });

    it("Should not allow allocate to be called by non-owner", async function () {
      await expect(
        airdrop.connect(otherAccount).allocate(otherAccount.address, 1)
      ).to.be.revertedWith("Ownable: caller is not the owner");
    });

    it("Should allow allocate to be called by owner", async function () {
      await expect(
        airdrop.allocate(otherAccount.address, 1)
      ).to.not.be.reverted;
    });

    it("Should allow allocate to be called by owner and reduce the balance of the contract while transferring the tokens to the recipient", async function () {
      const balBefore = await token.balanceOf(otherAccount.address);
      const contractBalBefore = await token.balanceOf(airdrop.address);
      const contractVariableBalBefore = await airdrop.balance();
      await airdrop.allocate(otherAccount.address, 1);
      const balAfter = await token.balanceOf(otherAccount.address);
      const contractBalAfter = await token.balanceOf(airdrop.address);
      const contractVariableBalAfter = await airdrop.balance();

      // tokens have been transferred from contract to recipient
      expect(balAfter.sub(balBefore)).to.equal(ethers.utils.parseEther("1"));
      expect(contractBalBefore.sub(contractBalAfter)).to.equal(ethers.utils.parseEther("1"));
      expect(contractVariableBalBefore.sub(contractVariableBalAfter)).to.equal(ethers.utils.parseEther("1"));
    });

    it("Should not allow allocate to be called by owner if the balance is 0", async function () {
      await airdrop.allocate(otherAccount.address, ethers.utils.parseEther("100"));
      await expect(
        airdrop.allocate(otherAccount.address, 1)
      ).to.be.revertedWith("No more BFG to collect");
    });

    it("Should not allow allocate to be called by owner if the balance is less than the amount", async function () { // @note contract auto decreases amount to whatever is the balance
      await expect(
        airdrop.allocate(otherAccount.address, ethers.utils.parseEther("101"))
      ).to.be.revertedWith("No more BFG to collect");
    });

    it("Should not allow allocate to be called by owner if the amount is 0", async function () {
      await expect(
        airdrop.allocate(otherAccount.address, 0)
      ).to.be.revertedWith("Need to request more than 0 BFG");
    });

    it("Should emit an event when allocate is called by owner", async function () {
      await expect(airdrop.allocate(otherAccount.address, 1))
        .to.emit(airdrop, "TransferSent")
        .withArgs(airdrop.address, otherAccount.address, ethers.utils.parseEther("1"));
    });

    it("Should send out whatever the balance is if the amount is more than the balance", async function () {
      await airdrop.allocate(otherAccount.address, ethers.utils.parseEther("101"));
      const balAfter = await token.balanceOf(otherAccount.address);
      const contractBalAfter = await token.balanceOf(airdrop.address);
      const contractVariableBalAfter = await airdrop.balance();

      expect(balAfter).to.equal(ethers.utils.parseEther("100"));
      expect(contractBalAfter).to.equal(0);
      expect(contractVariableBalAfter).to.equal(0);
    });
  });
});
