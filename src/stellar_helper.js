
const Stellar = require('stellar-sdk');
const HORIZON = 'https://horizon-testnet.stellar.org/';

module.exports.horizon = new Stellar.Server(HORIZON);
