/* eslint-disable camelcase */
const { horizon } = require('./stellar_helper');
const fantom = require('./ether_helper');

const K = 1000;
const FEE_RATE = 0.005;
const FEE_CONST = 0.05;

// A = stellar WFTM
// B = fantom wFTM

let pubkeyA;
let pubkeyB;
let assetA_issuer;
let assetA_code;
let LP_PRIVATE_KEY;

function configure(c) {
  ({
    pubkeyA,
    pubkeyB,
    assetA_issuer,
    assetA_code,
  } = c);
  LP_PRIVATE_KEY = process.env.LP_PRIVATE_KEY;
}
module.exports.configure = configure;

let currentNonce = -1;
async function loadTxCount() {
  currentNonce = await fantom.provider.getTransactionCount(pubkeyB);
  console.log(`nonce ${pubkeyB} = ${currentNonce}`);
  return currentNonce;
}
module.exports.loadTxCount = loadTxCount;

function calculate(tbalA, tbalB) {
  const adj = K / (tbalA * tbalB);
  const needA = tbalA * adj;
  const needB = tbalB * adj;
  const a_buys_b = needB / needA;
  const b_buys_a = needA / needB;
  return { a_buys_b, b_buys_a };
}
module.exports.calculate = calculate;

async function balances() {
  const acct = await horizon.accounts().accountId(pubkeyA).call();
  const bal = acct.balances.find((x) => x.asset_type === 'credit_alphanum4' &&
    x.asset_code === assetA_code &&
    x.asset_issuer === assetA_issuer);

  if (typeof bal === 'undefined') {
    throw new Error('account has no trustline to asset A');
  }

  const erc20 = new fantom.ethers.Contract(
    fantom.CONTRACT,
    fantom.ABI,
    fantom.provider,
  );
  const wftmBalanceWei = await erc20.balanceOf(pubkeyB);
  const wftmBalance = fantom.ethers.utils.formatEther(wftmBalanceWei);

  return {
    balanceA: bal.balance,
    balanceB: wftmBalance,
  };
}
module.exports.balances = balances;

function sendA(amt) {
  module.exports.balA -= amt; // HACK
}
async function sendB(amt, destPubkey) {
  const walletPriv = new fantom.ethers.Wallet(`0x${LP_PRIVATE_KEY}`);
  const wallet = walletPriv.connect(fantom.provider);
  const erc20 = new fantom.ethers.Contract(
    fantom.CONTRACT,
    fantom.ABI,
    wallet,
  );

  // increment the global tx count before submission
  let nonce = currentNonce;
  currentNonce +=1 ;

  const txResp = await erc20.transfer(
    destPubkey,
    fantom.ethers.utils.parseEther(amt.toString()),
    {
      gasLimit: 100000,
      gasPrice: 550 * 1000000000,
      nonce,
    },
  );
  console.log(txResp);
  console.log('waiting...');
  return txResp.wait();
}

async function get(forA, forB, destAddr) {
  if (forA > 0 && forB > 0) {
    throw new Error('Parameter ERROR: cannot exchange both');
  }

  const { balanceA, balanceB } = await balances();
  console.log(`pool balances WFTM=${balanceA} wFTM=${balanceB}`);
  let resultA = 0;
  let resultB = 0;
  let iter = 4;
  let ab = 0;
  let ba = 0;

  while (iter > 0) {
    const { a_buys_b, b_buys_a } = calculate(
      balanceA - resultA,
      balanceB - resultB,
    );
    resultB = forA * a_buys_b;
    resultA = forB * b_buys_a;
    ab = a_buys_b;
    ba = b_buys_a;
    iter -= 1;
  }

  let result;
  let aToB;
  if (resultA > 0) {
    result = resultA;
    aToB = false;
  } else {
    result = resultB;
    aToB = true;
  }

  result *= (1 - FEE_RATE);
  let ftmTx = '';
  if (result - FEE_CONST > 0) {
    const finalAmount = result - FEE_CONST;
    console.log(`sending ${finalAmount} to ${destAddr}`);
    if (aToB) {
      console.log(`exchange ${forA} A -> ${result} - ${FEE_CONST} B (${ab})`);
      ftmTx = await sendB(finalAmount, destAddr);
    } else {
      console.log(`exchange ${forA} B -> ${result} - ${FEE_CONST} A (${ba})`);
      ftmTx = await sendA(finalAmount, destAddr);
    }
    console.log(ftmTx);
  } else {
    console.log(`amount too small ${result} < ${FEE_CONST}`);
    result = 0;
  }
  return {
    amount: result,
    fee: FEE_CONST,
    tx: ftmTx.transactionHash,
  };
}

async function getA(forB, destAddr) {
  return get(0, forB, destAddr);
}
module.exports.getA = getA;

async function getB(forA, destAddr) {
  return get(forA, 0, destAddr);
}
module.exports.getB = getB;
