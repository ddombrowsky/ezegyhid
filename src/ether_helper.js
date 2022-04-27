require('dotenv').config();
const { ethers } = require('ethers');

const provider =
  new ethers.providers.JsonRpcProvider(process.env.FANTOM_PROVIDER);

const ABI = [
  'function balanceOf(address owner) view returns (uint256)',
  'function approve(address spender, uint256 amount) returns (bool)',
  'function allowance(address owner, address spender) view returns (uint256)',
  'function transfer(address recipient, uint256 amount)',
];
module.exports.ABI = ABI;
module.exports.CONTRACT = process.env.BASE_TOKEN;

const LP_ABI = [
  'function totalSupply() view returns (uint256)',
  'function balanceOf(address owner) view returns (uint256)',
  'function excess() view returns (int256)',
  'function rate() view returns (uint256)',
  'function deposit(uint amount) returns (bool)',
  'function withdraw(uint amount) returns (uint256)',
  'function transfer(address recipient, uint256 amount)',
  'function swap(uint256 amount, string memo)',
  'function pause()',
  'event Swap(address indexed owner, address indexed spender, uint256 value, uint256 fee, string memo)',
];
module.exports.LP_ABI = LP_ABI;
module.exports.LP_CONTRACT = process.env.LP_CONTRACT;

module.exports.provider = provider;
module.exports.ethers = ethers;
