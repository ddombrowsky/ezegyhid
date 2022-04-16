require('dotenv').config();
const { horizon } = require('./stellar_helper');
const db = require('./db_helper');
const lp = require('./lp');

function consoleLog(acct, str) {
  const s = `${acct} : ${str}`;
  console.log(s);
  db.execute.query(
    'INSERT into log(account_id, message) values($1, $2)',
    [acct, str]
  );
}

function lookup(ftmAccountId) {
  return db.execute.query(
    'SELECT * FROM account WHERE memo = $1',
    [ftmAccountId],
  ).then((result) => result.rows[0]);
}

function checktx(txid) {
  return db.execute.query(
    'SELECT * FROM tx WHERE txid = $1',
    [txid],
  ).then((result) => result.rows[0]);
}

function store(txid) {
  return db.execute.query(
    'INSERT INTO tx(txid, state, complete) VALUES($1,$2,$3)',
    [txid, 0, false],
  ).then((result) => result.rowCount > 0);
}

const TX_SUCCESS = 1;
const TX_FAIL = 2;
function updateTx(txid, state, complete) {
  return db.execute.query(
    'UPDATE tx SET state = $1, complete = $2 WHERE txid = $3',
    [state, complete, txid],
  ).then((result) => result.rowCount);
}

function processOperations(message, ftmAccountId, hash) {
  if (typeof message.records === 'undefined') {
    return;
  }
  if (message.records.length > 1) {
    // TODO: support multiple operations
    return;
  }

  consoleLog('SYSTEM', 'Testing operation...');
  consoleLog('SYSTEM', JSON.stringify(message));

  const operation = message.records[0];
  if (!(operation.transaction_successful &&
    operation.type === 'payment' &&
    operation.asset_type === 'credit_alphanum4' &&
    operation.asset_code === assetA_code &&
    operation.asset_issuer === assetA_issuer && 
    operation.to === pubkeyA)) {
    consoleLog('SYSTEM', 'not interested.');
    return;
  }
  const amountWFTM = operation.amount;
  consoleLog(
    ftmAccountId,
    `received ${amountWFTM} WFTM(stellar) ` +
    `for id ${ftmAccountId}`
  );

  if (amountWFTM < 0.1) {
    consoleLog(ftmAccountId, `ERROR: amount too small: ${amountWFTM}`);
    return;
  }

  if (amountWFTM > 5) {
    consoleLog(ftmAccountId, `ERROR: amount too large: ${amountWFTM}`);
    return;
  }

  consoleLog(ftmAccountId, 'We care!');

  let ftmAddress;

  lookup(ftmAccountId)
    .then((row) => {
      consoleLog(ftmAccountId, 'local account info:');
      consoleLog(ftmAccountId, JSON.stringify(row));
      if (!row) {
        throw new Error(`account not found ${ftmAccountId}`);
      }
      ftmAddress = row.ftm_address;
      consoleLog(ftmAccountId,
        `received ${amountWFTM} WFTM(stellar) ` +
        `for id ${ftmAccountId} ` +
        `to ${ftmAddress} for ${row.amount}`
      );
      consoleLog(ftmAccountId,`storing tx ${hash}`);
      return store(hash);
    }).then(() => {
      consoleLog(ftmAccountId,
        'LP: read balances, calculate rate, send result...'
      );
      return lp.getB(amountWFTM, ftmAddress);
    }).then((ftmResult) => {
      let amt = ftmResult.amount;
      let promise;
      if (amt) {
        consoleLog(ftmAccountId,
          `COMPLETE: account ${ftmAccountId} ${ftmAddress} `+
          `received ${amt} - ${ftmResult.fee}`
        );
        promise = updateTx(hash, TX_SUCCESS, true);
        consoleLog(ftmAccountId,
          `FTM transaction: ${ftmResult.tx}`
        );
      } else {
        consoleLog(ftmAccountId,
          `ERROR: account ${ftmAccountId} ${ftmAddress} failed`
        );
        promise = updateTx(hash, TX_FAIL, false);
      }
      return promise;
    }).then((affected) => {
      consoleLog(ftmAccountId,
        `COMPLETE: ${hash} updated ${affected} transactions`
      );
    }).catch((e) => {
      consoleLog(ftmAccountId, 'ERROR: ' + e);
    });
}

function oper(message, ftmAccountId, hash) {
  checktx(hash)
    .then((row) => {
      if (row) {
        consoleLog(ftmAccountId, `tx already exists: ${hash}`);
        return;
      }
      consoleLog(ftmAccountId, `new tx: ${hash}`);
      processOperations(message, ftmAccountId, hash);
    });
}

function recv(message) {
  if (!message.successful) {
    return;
  }

  consoleLog('SYSTEM', `*** tx ${message.hash}`);

  if (message.memo_type !== 'text') {
    return;
  }

  const ftmAccountId = message.memo;

  message.operations().then((m) => oper(m, ftmAccountId, message.hash));
}

let pubkeyA = process.env.XLMPUBLIC;
let pubkeyB = process.env.FTMPUBLIC;
let assetA_issuer = process.env.XLMISSUER;
let assetA_code = process.env.XLMCODE;

lp.configure({
  pubkeyA,
  pubkeyB,
  assetA_issuer,
  assetA_code,
});
function go() {
  horizon
    .transactions()
    .forAccount(pubkeyA)
    .stream({
      onmessage: recv,
    });
}

lp.loadTxCount()
  .then((nonce) => {
    consoleLog('SYSTEM', `nonce = ${nonce}`);
    return lp.balances()
  }).then((bals) => {
    consoleLog('SYSTEM', '== POOL BALANCE ==');
    consoleLog('SYSTEM',
      `== ${bals.balanceA} WFTM,` +
      ` ${bals.balanceB} wFTM`
    );
    consoleLog('SYSTEM',
      `== 1 WFTM = ${bals.balanceB / bals.balanceA} wFTM`
    );
    consoleLog('SYSTEM',
      `== 1 wFTM = ${bals.balanceA / bals.balanceB} WFTM`
    );
    go();
  });
