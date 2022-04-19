require('dotenv').config();
const { ethers } = require('ethers');

const provider =
  new ethers.providers.JsonRpcProvider(process.env.FANTOM_PROVIDER);

const ABI = [
  'function balanceOf(address owner) view returns (uint256)',
  'function transfer(address recipient, uint256 amount) external returns (bool)'
];
module.exports.ABI = ABI;

const CONTRACT = '0x21be370D5312f44cB42ce377BC9b8a0cEF1A4C83';
module.exports.CONTRACT = CONTRACT;

module.exports.provider = provider;
module.exports.ethers = ethers;
