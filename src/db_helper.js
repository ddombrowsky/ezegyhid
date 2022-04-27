const parseDbUrl = require('parse-database-url');

const dbConfig = parseDbUrl(process.env.DATABASE_URL);
const Pool = require('pg').Pool;

const pool = new Pool({
    user: dbConfig.user,
    host: dbConfig.host,
    database: dbConfig.database,
    password: dbConfig.password,
    port: dbConfig.port,
    ssl: { "rejectUnauthorized": false },
});
 
module.exports.execute = pool;

function consoleLog(acct, str) {
  const s = `${acct} : ${str}`;
  console.log(s);
  pool.query(
    'INSERT into log(account_id, message) values($1, $2)',
    [acct, str]
  );
}
module.exports.consoleLog = consoleLog;

function lookup(ftmAccountId) {
  return pool.query(
    'SELECT * FROM account WHERE memo = $1',
    [ftmAccountId],
  ).then((result) => result.rows[0]);
}
module.exports.lookup = lookup;

function checktx(txid) {
  return pool.query(
    'SELECT * FROM tx WHERE txid = $1',
    [txid],
  ).then((result) => result.rows[0]);
}
module.exports.checktx = checktx;

function store(txid) {
  return pool.query(
    'INSERT INTO tx(txid, state, complete) VALUES($1,$2,$3)',
    [txid, 0, false],
  ).then((result) => result.rowCount > 0);
}
module.exports.store = store;

module.exports.TX_SUCCESS = 1;
module.exports.TX_FAIL = 2;
module.exports.TX_IGNORE = 3;
function updateTx(txid, state, complete) {
  return pool.query(
    'UPDATE tx SET state = $1, complete = $2 WHERE txid = $3',
    [state, complete, txid],
  ).then((result) => result.rowCount);
}
module.exports.updateTx = updateTx;
