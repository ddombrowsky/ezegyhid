/* eslint-disable camelcase */
require('dotenv').config();
const { horizon } = require('./stellar_helper');
const db = require('./db_helper');
const lp = require('./lp');

const pubkeyA = process.env.XLMPUBLIC;
const pubkeyB = process.env.FTMPUBLIC;
const assetA_issuer = process.env.XLMISSUER;
const assetA_code = process.env.XLMCODE;

function processOperations(message, accountId, hash) {
  if (typeof message.records === 'undefined') {
    return;
  }
  if (message.records.length > 1) {
    // TODO: support multiple operations
    return;
  }

  db.consoleLog('SYSTEM-XLM', 'Testing operation...');
  db.consoleLog('SYSTEM-XLM', JSON.stringify(message));

  const operation = message.records[0];
  if (!(operation.transaction_successful &&
    operation.type === 'payment' &&
    operation.asset_type === 'credit_alphanum4' &&
    operation.asset_code === assetA_code &&
    operation.asset_issuer === assetA_issuer &&
    operation.to === pubkeyA)) {
    db.consoleLog('SYSTEM-XLM', 'not interested.');
    return;
  }
  const amountWFTM = operation.amount;
  db.consoleLog(
    accountId,
    `received ${amountWFTM} WFTM(stellar) ` +
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

  let ftmAddress;

  db.lookup(accountId)
    .then((row) => {
      db.consoleLog(accountId, 'local account info:');
      db.consoleLog(accountId, JSON.stringify(row));
      if (!row) {
        throw new Error(`account not found ${accountId}`);
      }
      ftmAddress = row.address;
      db.consoleLog(
        accountId,
        `received ${amountWFTM} WFTM(stellar) ` +
        `for id ${accountId} ` +
        `to ${ftmAddress} slippage ${row.amount}`,
      );
      db.consoleLog(accountId, `storing tx ${hash}`);
      return db.store(hash);
    })
    .then(() => {
      db.consoleLog(
        accountId,
        'LP: read balances, calculate rate, send result...',
      );
      return lp.getB(amountWFTM, ftmAddress);
    })
    .then((ftmResult) => {
      const amt = ftmResult.amount;
      let promise;
      if (amt) {
        db.consoleLog(
          accountId,
          `COMPLETE: account ${accountId} ${ftmAddress} ` +
          `received ${amt} - ${ftmResult.fee}`,
        );
        promise = db.updateTx(hash, db.TX_SUCCESS, true);
        db.consoleLog(
          accountId,
          `Fantom transaction: ${ftmResult.tx}`,
        );
      } else {
        db.consoleLog(
          accountId,
          `ERROR: account ${accountId} ${ftmAddress} failed`,
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
    });
}

function oper(message, accountId, hash) {
  db.checktx(hash)
    .then((row) => {
      if (row) {
        db.consoleLog('SYSTEM-XLM', `tx already exists: ${hash}`);
        return;
      }
      db.consoleLog(accountId, `new tx: ${hash}`);
      processOperations(message, accountId, hash);
    });
}

function recv(message) {
  if (!message.successful) {
    return;
  }

  db.consoleLog('SYSTEM-XLM', `*** tx ${message.hash}`);

  if (message.memo_type !== 'text') {
    return;
  }

  const accountId = message.memo;

  message.operations().then((m) => oper(m, accountId, message.hash));
}

function go() {
  horizon
    .transactions()
    .forAccount(pubkeyA)
    .stream({
      onmessage: recv,
    });
}

module.exports.START = function() {
  lp.configure({
    pubkeyA,
    pubkeyB,
    assetA_issuer,
    assetA_code,
  });

  lp.loadTxCount()
    .then((nonce) => {
      db.consoleLog('SYSTEM-XLM', `nonce = ${nonce}`);
      return lp.balances();
    }).then((bals) => {
      db.consoleLog('SYSTEM-XLM', '== POOL BALANCE ==');
      db.consoleLog(
        'SYSTEM-XLM',
        `== ${bals.balanceA} WFTM(stellar),` +
        ` ${bals.balanceB} wFTM(fantom)`,
      );
      db.consoleLog(
        'SYSTEM-XLM',
        `== 1 WFTM(stellar) = ${bals.balanceB / bals.balanceA} wFTM(fantom)`,
      );
      db.consoleLog(
        'SYSTEM-XLM',
        `== 1 wFTM(fantom) = ${bals.balanceA / bals.balanceB} WFTM(stellar)`,
      );
      go();
    });
}
