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
