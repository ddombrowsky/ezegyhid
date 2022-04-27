
const fantom = require('./ether_helper');

const LP_ABI = fantom.LP_ABI;
const LP_CONTRACT = fantom.LP_CONTRACT;
const ERC20_ABI = fantom.ABI;

let ERC20_CONTRACT;
let walletPub;
let lpWalletPub;
let memo;

const testnet=true;

if (testnet) {
  ERC20_CONTRACT = process.env.BASE_TOKEN;
  walletPub = '0x4e80BAf6D4E635F5D3D4152f371b1CAC39DDfda2'; // testnet
  lpWalletPub = '0xEFD08f19DCd2EE843918C842e8d830Abf8D68752'; // testnet
} else {
  ERC20_CONTRACT = '0x5FbDB2315678afecb367f032d93F642f64180aa3';
  walletPub = '0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266';
  lpWalletPub = '0x70997970c51812dc3a010c7d01b50e0d17dc79c8';
  memo = '0668b9ca672c3e07';
}

const PRIVATE_KEY = process.env.PRIVATE_KEY;
const LP_PRIVATE_KEY = process.env.LP_PRIVATE_KEY;

const MAX_ALLOW = fantom.ethers.utils.parseEther(0xffffffff.toString());

const lp_pub = new fantom.ethers.Contract(
  LP_CONTRACT,
  LP_ABI,
  fantom.provider,
);

const erc20_pub = new fantom.ethers.Contract(
  ERC20_CONTRACT,
  ERC20_ABI,
  fantom.provider,
);

async function balances() {
  let balWei = await lp_pub.excess();
  let bal = fantom.ethers.utils.formatEther(balWei);
  console.log(`excess = ${bal} wFTM`);

  balWei = await lp_pub.totalSupply();
  bal = fantom.ethers.utils.formatEther(balWei);
  console.log(`total supply = ${bal} ssrwFTM`);

  let ssrbalWei = await lp_pub.balanceOf(walletPub);
  let ssrbal = fantom.ethers.utils.formatEther(ssrbalWei);
  console.log(`User wallet balance = ${ssrbal} ssrwFTM`);

  balWei = await erc20_pub.balanceOf(walletPub);
  bal = fantom.ethers.utils.formatEther(balWei);
  console.log(`User wallet balance = ${bal} wFTM`);

  balWei = await fantom.provider.getBalance(walletPub);
  bal = fantom.ethers.utils.formatEther(balWei);
  console.log(`User wallet balance = ${bal} FTM`);

  balWei = await erc20_pub.balanceOf(lpWalletPub);
  bal = fantom.ethers.utils.formatEther(balWei);
  console.log(`LP wallet balance = ${bal} wFTM`);

  return ssrbal;
}

async function checkLPApproval() {
  if (!LP_PRIVATE_KEY) {
    return;
  }
  const walletPriv = new fantom.ethers.Wallet(`0x${LP_PRIVATE_KEY}`);
  const wallet = walletPriv.connect(fantom.provider);

  const erc20 = new fantom.ethers.Contract(
    ERC20_CONTRACT,
    ERC20_ABI,
    wallet,
  );

  const allowance = await erc20.allowance(lpWalletPub, LP_CONTRACT);
  console.log(`allowance = ${allowance}`);
  if (allowance < 10000) {
    console.log(`${lpWalletPub} allowing contract to spend wFTM`);
    await erc20.approve(LP_CONTRACT, MAX_ALLOW);
  }
}

async function main() {
  const walletPriv = new fantom.ethers.Wallet(`0x${PRIVATE_KEY}`);
  const wallet = walletPriv.connect(fantom.provider);
  console.log(`wallet = ${wallet.address}`);

  const lp = new fantom.ethers.Contract(
    LP_CONTRACT,
    LP_ABI,
    wallet,
  );

  const erc20 = new fantom.ethers.Contract(
    ERC20_CONTRACT,
    ERC20_ABI,
    wallet,
  );

  await checkLPApproval();

  // load other test wallets
  /*
  await erc20.transfer('0xdd2fd4581271e230360230f9337d5c0430bf44c0',
    fantom.ethers.utils.parseEther('1000'));
  await erc20.transfer('0x8626f6940e2eb28930efb4cef49b2d1f2c9c1199',
    fantom.ethers.utils.parseEther('1000'));
  */

  let allowance = await erc20.allowance(walletPub, LP_CONTRACT);
  console.log(`allowance = ${allowance}`);
  if (allowance < 10000) {
    console.log(`${walletPub} allowing contract to spend wFTM`);
    await erc20.approve(LP_CONTRACT, MAX_ALLOW);
  }

  console.log('=== before');
  await balances();

  //await lp.pause();

  for (let i=0;i<1;i++) {
    console.log('=== middle ' + i);
    let txResp = await lp.deposit(fantom.ethers.utils.parseEther('171915'));
    let txReceipt = await txResp.wait();
    console.log('deposit receipt: ' + txReceipt.transactionHash);
    await balances();
  }

  console.log('=== simulate fee accrual...');
  txResp = await erc20.transfer(
    lpWalletPub,
    fantom.ethers.utils.parseEther('1'),
  );
  txReceipt = await txResp.wait();
  console.log('transfer receipt: ' + txReceipt.transactionHash);
  await balances();

  console.log('=== check rate');
  let rate = (await lp.rate()) / 10**36;
  console.log(`rate: 1 wFTM = ${rate} ssrwFTM`);
  txResp = await lp.withdraw(fantom.ethers.utils.parseEther(rate.toString()));
  txReceipt = await txResp.wait();
  console.log('withdraw 1 wFTM receipt: ' + txReceipt.transactionHash);
  await balances();

  let swapid =
    fantom.ethers.utils.id('Swap(address,address,uint256,uint256,string)');
  console.log('=== check swap: ' + swapid);
  fantom.provider.on([swapid], (log, ev) => {
    console.log('SWAP EVENT: ' + JSON.stringify(log));
    console.log('            ' + JSON.stringify(ev));
  });
  txResp = await lp.swap(fantom.ethers.utils.parseEther('1'), memo);
  txReceipt = await txResp.wait();
  console.log('swap receipt: ' + txReceipt.transactionHash);
  console.log('tx : ' + JSON.stringify(txResp));
  let memoHex = 
    memo.split('').reduce((acc, x) => acc += x.charCodeAt(0).toString(16), '');
  console.log('data should contain: ' + memoHex);
  await balances();

  console.log('=== check balance');
  let ssrbal = ((parseFloat(await balances()) - 2) / 10);
  if (ssrbal < 0) {
    ssrbal = 0;
  }

  let wdraw = ssrbal * 9;
  console.log('=== after');
  console.log(`withdrawing ${wdraw} ssrwFTM`);
  txResp = await lp.withdraw(fantom.ethers.utils.parseEther(wdraw.toString()));
  txReceipt = await txResp.wait();
  console.log('withdraw receipt: ' + txReceipt.transactionHash);
  await balances();

  txResp = await lp.transfer('0xdd2fd4581271e230360230f9337d5c0430bf44c0',
    fantom.ethers.utils.parseEther(ssrbal.toString()));
  txReceipt = await txResp.wait();
  console.log('transfer receipt: ' + txReceipt.transactionHash);
  await balances();
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
