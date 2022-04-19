
const Stellar = require('stellar-sdk');
const HORIZON = process.env.STELLAR_PROVIDER;

module.exports.horizon = new Stellar.Server(HORIZON);
