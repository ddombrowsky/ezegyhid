require('dotenv').config();

// this is a temp fix because heroku can only
// have 2 fee dynos, so the stellar and fantom
// listeners need to be shoved into one.

const fantom = require('./fantom');
const stellar = require('./stellar');

fantom.START();
stellar.START();
