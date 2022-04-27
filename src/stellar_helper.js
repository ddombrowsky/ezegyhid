
const Stellar = require('stellar-sdk');
module.exports.Stellar = Stellar;

const HORIZON = process.env.STELLAR_PROVIDER;
module.exports.horizon = new Stellar.Server(HORIZON);

const PASSPHRASE = process.env.STELLAR_PASSPHRASE;
module.exports.networkPassphrase = PASSPHRASE;
