require('dotenv').config();
const express = require('express');
const app = express();
const path = require('path');
const db = require('./db_helper');
const crypto = require('crypto');
const fs = require('fs');
const lp = require('./lp');

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

function lookupFtm(address) {
  return db.execute.query(
    'SELECT * FROM account WHERE ftm_address = $1',
    [address],
  ).then((result) => result.rows[0]);
}

function setFtm(address, memo) {
console.log(address, memo);
  return db.execute.query(
    'INSERT INTO account(memo, ftm_address, amount) values ($1, $2, 0.05)',
    [memo, address],
  );
}

app.get('/', (req, res) => {
  let options = {
    root: path.join(__dirname, 'public'),
    dotfiles: 'deny',
    headers: {
      'x-timestamp': Date.now(),
      'x-sent': true
    }
  };
  res.sendFile('index.html', options);
});

app.get('/q', (req, res) => {
  const ftm_addr = req.query.ftm_addr;
  if(typeof ftm_addr === 'undefined' ||
     ftm_addr.length === 0)
  {
    res.sendStatus(404);
    res.end();
    return;
  }

  const newmemo = crypto.randomBytes(8).toString('hex');
  let currentMemo;

  lookupFtm(ftm_addr)
    .then((row) => {
      if (row) {
        return row.memo;
      } else {
        return setFtm(ftm_addr, newmemo);
      }
    }).then((result, error) => {
      if (typeof result === 'string') {
        return result;
      }
      if (error) {
        throw new Error('insert error: ' + error);
      }

      if (result.rowCount != 1) {
        throw new Error('insert error: did not insert 1 row');
      }

      return newmemo;
    }).then((memo) => {
      currentMemo = memo;
      return lp.balances();
    }).then((balances) => {
      let stellarftm = balances.balanceA;
      let wftm = balances.balanceB;
      let bstr = `${stellarftm} WFTM, ${wftm} wFTM<br/><br/>` +
        "<span style='padding:2em'>&nbsp;</span>" +
        `1WFTM = ${wftm/stellarftm} wFTM, 1wFTM = ${stellarftm/wftm} WFTM`;
      let html = fs.readFileSync(path.join(__dirname, 'public', 'q.html'));
      let repl = html.toString()
        .replace('FANTOMADDR', ftm_addr)
        .replace('XLMMEMO', currentMemo)
        .replace('POOLRATES', bstr)
      res.set('Content-Type', 'text/html');
      res.send(repl);
    });
});

app.listen(process.env.PORT, (err) => {
  if (err) {
    console.log(err);
  } else {
    console.log(`server listening on port ${process.env.PORT}`);
  }
});
