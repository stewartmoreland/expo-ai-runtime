// Entry point resolved by Expo during `expo prebuild`. The package itself is an
// ESM module ("type": "module"), so the plugin is compiled to CommonJS under
// plugin/build (marked via plugin/package.json) and re-exported here as .cjs.
module.exports = require('./plugin/build');
