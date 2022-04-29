/* eslint-disable camelcase */
require('dotenv').config();

const express = require('express');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const db = require('./db_helper');
const lp = require('./lp');

const app = express();

const pubkeyA = process.env.XLMPUBLIC;
const pubkeyB = process.env.FTMPUBLIC;
const assetA_issuer = process.env.XLMISSUER;
const assetA_code = process.env.XLMCODE;

lp.configure({
  pubkeyA,
  pubkeyB,
  assetA_issuer,
  assetA_code,
});

function lookup(address) {
  return db.execute.query(
    'SELECT * FROM account WHERE address = $1',
    [address],
  ).then((result) => result.rows[0]);
}

function set(address, memo) {
  return db.execute.query(
    'INSERT INTO account(memo, address, amount) values ($1, $2, 0.05)',
    [memo, address],
  );
}

function getLogs(memo) {
  if (memo === 'SYSTEM') {
    return Promise.resolve([]);
  }

  return db.execute.query(
    'SELECT * FROM log WHERE account_id = $1 ' +
    'ORDER BY dt DESC LIMIT 50',
    [memo],
  ).then((result) => result.rows);
}

const PRJ_ROOT = path.resolve(__dirname, '..');

app.get('/', (req, res) => {
  const options = {
    root: path.join(PRJ_ROOT, 'public'),
    dotfiles: 'deny',
    headers: {
      'x-timestamp': Date.now(),
      'x-sent': true,
    },
  };
  res.sendFile('index.html', options);
});

app.get('/q', (req, res) => {
  const ftmAddr = req.query.ftm_addr;
  const xlmAddr = req.query.xlm_addr;
  const isHtml = req.accepts('html');
  if ((typeof ftmAddr === 'undefined' ||
       ftmAddr.length === 0) &&
      (typeof xlmAddr === 'undefined' ||
       xlmAddr.length === 0)) {
    res.sendStatus(404);
    res.end();
    return;
  }

  const newmemo = crypto.randomBytes(8).toString('hex');
  let currentMemo;
  let currentBalances;

  let addr;
  let toFantom;

  if (typeof ftmAddr === 'undefined' || ftmAddr.length === 0) {
    addr = xlmAddr;
    toFantom = false;
  } else {
    addr = ftmAddr;
    toFantom = true;
  }

  lookup(addr)
    .then((row) => {
      if (row) {
        return row.memo;
      }
      return set(addr, newmemo);
    }).then((result, error) => {
      if (typeof result === 'string') {
        return result;
      }
      if (error) {
        throw new Error(`insert error: ${error}`);
      }

      if (result.rowCount !== 1) {
        throw new Error('insert error: did not insert 1 row');
      }

      return newmemo;
    })
    .then((memo) => {
      currentMemo = memo;
      return lp.balances();
    })
    .then((balances) => {
      currentBalances = balances;
      return getLogs(currentMemo);
    })
    .then((logs) => {
      const stellarftm = currentBalances.balanceA;
      const wftm = currentBalances.balanceB;
      const html = fs.readFileSync(path.join(PRJ_ROOT, 'public', 'q.html'));
      let lpAddr;
      if (toFantom) {
        lpAddr = 'GBIYTJUA6W25EFRVQJE3LNQ6VONUQ4E4TMCK7W5OBDFUQVJUHCZMOBTV';
      } else {
        lpAddr = '0x3B4C7E7D0b8680cfF79bD0De7827098c3608DDC7';
      }
      if (isHtml) {
        let logstr = 'Logfile (newest first):<br/><samp>';
        logs.forEach((msg) => {
          const dstr = msg.dt.toISOString();
          logstr += `${dstr}|${msg.message}<br/>`;
        });
        logstr += '</samp>';
        const bstr = `${stellarftm} WFTM(stellar), ${wftm} WFTM(fantom)<br/><br/>` +
          "<span style='padding:2em'>&nbsp;</span>" +
          `1WFTM(stellar) = ${wftm / stellarftm} WFTM(fantom), 1WFTM(fantom) = ${stellarftm / wftm} WFTM(stellar)`;

        const repl = html.toString()
          .replace('LPADDR', lpAddr)
          .replace('DESTADDR', addr)
          .replace('XLMMEMO', currentMemo)
          .replace('POOLRATES', bstr)
          .replace('LOGS', logstr);
        res.set('Content-Type', 'text/html');
        res.send(repl);
      } else {
        res.set('Content-Type', 'application/json');
        res.send(JSON.stringify({
          dest_address: addr,
          lp_address: lpAddr,
          account_id: currentMemo,
          rates: {
            stellar_asset_balance: parseFloat(stellarftm),
            fantom_asset_balance: parseFloat(wftm),
            stellar_buys_fantom: wftm / stellarftm,
            fantom_buys_stellar: stellarftm / wftm,
          },
          logs,
        }));
      }
    });
});

app.listen(process.env.PORT, (err) => {
  if (err) {
    console.log(err);
  } else {
    console.log(`server listening on port ${process.env.PORT}`);
  }
});
