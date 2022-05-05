require('dotenv').config();
const { ethers, provider, LP_CONTRACT, LP_ABI } = require('./ether_helper');
const db = require('./db_helper');
const lp = require('./lp');

const LP_WALLET = process.env.FTMPUBLIC;

const lpContract = new ethers.Contract(
    LP_CONTRACT,
    LP_ABI,
    provider,
);

const pubkeyA = process.env.XLMPUBLIC;
const assetA_issuer = process.env.XLMISSUER;
const assetA_code = process.env.XLMCODE;

function processOperations(message, accountId, hash) {
  db.consoleLog('SYSTEM-FTM', 'Testing operation...');
  db.consoleLog('SYSTEM-FTM', JSON.stringify(message));

  const amountWFTM = (message.value - message.fee) / 10**18;

  db.consoleLog(
    accountId,
    `received ${amountWFTM} WFTM(fantom) ` +
    `for id ${accountId}`,
  );

  if (amountWFTM < 0.1) {
    db.consoleLog(accountId, `ERROR: amount too small: ${amountWFTM}`);
    return;
  }

  if (amountWFTM > 20) {
    db.consoleLog(accountId, `ERROR: amount too large: ${amountWFTM}`);
    return;
  }

  db.consoleLog(accountId, 'We care!');

  let xlmAddress;

  db.lookup(accountId)
    .then((row) => {
      db.consoleLog(accountId, 'local account info:');
      db.consoleLog(accountId, JSON.stringify(row));
      if (!row) {
        throw {
          internal: true,
          message: `account not found ${accountId}`,
        };
      }
      xlmAddress = row.address;
      db.consoleLog(
        accountId,
        `received ${amountWFTM} WFTM(fantom) ` +
        `for id ${accountId} ` +
        `to ${xlmAddress} slippage ${row.amount}`,
      );
      db.consoleLog(accountId, `storing tx ${hash}`);
      return db.store(hash);
    })
    .then(() => {
      db.consoleLog(
        accountId,
        'LP: read balances, calculate rate, send result...',
      );
      return lp.getA(amountWFTM, xlmAddress);
    })
    .then((ftmResult) => {
      const amt = ftmResult.amount;
      let promise;
      if (amt) {
        db.consoleLog(
          accountId,
          `COMPLETE: account ${accountId} ${xlmAddress} ` +
          `received ${amt} - ${ftmResult.fee}`,
        );
        promise = db.updateTx(hash, db.TX_SUCCESS, true);
        db.consoleLog(
          accountId,
          `Stellar transaction: ${ftmResult.tx}`,
        );
      } else {
        db.consoleLog(
          accountId,
          `ERROR: account ${accountId} ${xlmAddress} failed`,
        );
        promise = db.updateTx(hash, db.TX_FAIL, false);
      }
      return promise;
    })
    .then((affected) => {
      db.consoleLog(
        accountId,
        `COMPLETE: ${hash} updated ${affected} transactions`,
      );
    })
    .catch((e) => {
      db.consoleLog(accountId, `ERROR: ${e.message}`);
      if (!e.internal) {
        db.consoleLog('SYSTEM-FTM', e.stack);
      }
    });
}

function oper(message, accountId, hash) {
  db.checktx(hash)
    .then((row) => {
      if (row) {
        db.consoleLog('SYSTEM-FTM', `tx already exists: ${hash}`);
        return;
      }
      db.consoleLog(accountId, `new tx: ${hash}`);
      processOperations(message, accountId, hash);
    });
}

function recv(message) {
  db.consoleLog('SYSTEM-FTM', `*** tx ${message.hash}`);
  db.consoleLog('SYSTEM-FTM', JSON.stringify(message));

  const accountId = message.memo;

  oper(message, accountId, message.hash);
}

function go() {
  let filter = lpContract.filters.Swap();
  db.consoleLog('SYSTEM-FTM', `listening for event id ${JSON.stringify(filter)}`);
  provider.on(filter, (ev) => {
      db.consoleLog('SWAP EVENT: ' + JSON.stringify(ev));
      if (ev.address !== LP_CONTRACT) {
        db.consoleLog('SYSTEM-FTM', 'ignored stray swap event');
        return;
      }
      let data = lpContract.interface.parseLog(ev);
      db.consoleLog(JSON.stringify(data));

      if (data.args.length != 5) {
        db.consoleLog('SYSTEM-FTM', 'ignored swap event with invalid arguments');
        return;
      }

      let sender = data.args[0];
      let dest = data.args[1]; // should be 0s
      let value = ethers.BigNumber.from(data.args[2]);
      let fee = ethers.BigNumber.from(data.args[3]);
      let memo = data.args[4];
      let hash = ev.transactionHash;

      db.consoleLog('SYSTEM-FTM', `got swap event with sender: ${sender}`);

      if (dest.toUpperCase() !== LP_WALLET.toUpperCase()) {
        db.consoleLog('SYSTEM-FTM', `swap event with invalid destination: ${dest}`);
        return;
      }

      recv({
        sender,
        dest,
        value,
        fee,
        memo,
        hash
      });

  });
}

module.exports.START = function () {
  lp.configure({
    pubkeyA,
    pubkeyB: LP_WALLET,
    assetA_issuer,
    assetA_code,
  });

  lp.loadTxCount()
    .then((nonce) => {
      db.consoleLog('SYSTEM-FTM', `nonce = ${nonce}`);
      return lp.balances();
    }).then((bals) => {
      db.consoleLog('SYSTEM-FTM', '== POOL BALANCE ==');
      db.consoleLog(
        'SYSTEM-FTM',
        `== ${bals.balanceA} WFTM(stellar),` +
        ` ${bals.balanceB} wFTM(fantom)`,
      );
      db.consoleLog(
        'SYSTEM-FTM',
        `== 1 WFTM(stellar) = ${bals.balanceB / bals.balanceA} wFTM(fantom)`,
      );
      db.consoleLog(
        'SYSTEM-FTM',
        `== 1 wFTM(fantom) = ${bals.balanceA / bals.balanceB} WFTM(stellar)`,
      );
      go();
    });
}
