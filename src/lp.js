/* eslint-disable camelcase */
const { Stellar, horizon, networkPassphrase } = require('./stellar_helper');
const fantom = require('./ether_helper');
const db = require('./db_helper');

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
let XLM_PRIVATE_KEY;

function configure(c) {
  ({
    pubkeyA,
    pubkeyB,
    assetA_issuer,
    assetA_code,
  } = c);
  LP_PRIVATE_KEY = process.env.LP_PRIVATE_KEY;
  XLM_PRIVATE_KEY = process.env.XLM_PRIVATE_KEY;
  if (!pubkeyA ||
      !pubkeyB ||
      !assetA_issuer ||
      !assetA_code ||
      !LP_PRIVATE_KEY ||
      !XLM_PRIVATE_KEY)
  {
    throw new Error('invalid parameters in configure()');
  }
}
module.exports.configure = configure;

let currentNonce = -1;
async function loadTxCount() {
  currentNonce = await fantom.provider.getTransactionCount(pubkeyB);
  db.consoleLog('LP', `nonce ${pubkeyB} = ${currentNonce}`);
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

function processHorizonException(ex) {
  let msg = ex.message;
  if (ex.response &&
      ex.response.data) {
    db.consoleLog('LP', JSON.stringify(ex.response.data));
    if (ex.response.data.extras) {
      msg = JSON.stringify(ex.response.data.extras.result_codes);
    }
  }
  return msg;
}

async function sendA(amt, destPubkey) {
  let account = await horizon.loadAccount(pubkeyA);
  let accountKey = Stellar.Keypair.fromSecret(XLM_PRIVATE_KEY);
  let baseFee = await horizon.fetchBaseFee();
  let asset = new Stellar.Asset(assetA_code, assetA_issuer);
  if (baseFee > 100000) {
    baseFee = 100000;
  }
  db.consoleLog('LP', `stellar baseFee ${baseFee} stroops`);
  let tx = new Stellar.TransactionBuilder(account, {
      fee: baseFee,
      networkPassphrase,
    })
    .addOperation(Stellar.Operation.payment({
      destination: destPubkey,
      asset,
      amount: amt.toFixed(7),
    }))
    .setTimeout(180)
    .build();

  tx.sign(accountKey);
  let ret = {};
  try {
    let resp = await horizon.submitTransaction(tx);
    if (!resp.successful) {
      throw new Error(`Unsuccessful tx: ${processHorizonException(resp)}`);
    }
    ret.transactionHash = resp.hash;
  } catch(e) {
    throw new Error(`Error processing tx: ${processHorizonException(e)}`);
  }

  return ret;
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
  db.consoleLog('LP', JSON.stringify(txResp));
  db.consoleLog('LP', 'waiting...');
  return txResp.wait();
}

async function get(forA, forB, destAddr) {
  if (forA > 0 && forB > 0) {
    throw new Error('Parameter ERROR: cannot exchange both');
  }

  const { balanceA, balanceB } = await balances();
  db.consoleLog('LP', `pool balances WFTM=${balanceA} wFTM=${balanceB}`);
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
  let fee = FEE_CONST;
  if (!aToB) {
    // fee for B -> A is much less
    fee = FEE_CONST / 100;
  }

  if (result - fee > 0) {
    const finalAmount = result - fee;
    db.consoleLog('LP', `sending ${finalAmount} to ${destAddr}`);
    if (aToB) {
      db.consoleLog('LP', `exchange ${forA} A -> ${result} - ${fee} B (${ab})`);
      ftmTx = await sendB(finalAmount, destAddr);
    } else {
      db.consoleLog('LP', `exchange ${forB} B -> ${result} - ${fee} A (${ba})`);
      ftmTx = await sendA(finalAmount, destAddr);
    }
    db.consoleLog('LP', JSON.stringify(ftmTx));
  } else {
    db.consoleLog('LP', `amount less than fee ${result} < ${fee}`);
    result = 0;
  }
  return {
    amount: result,
    fee: fee,
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
