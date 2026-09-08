/** Tailwind config for the 4 auth pages — identical to their inline configs
 *  (verified identical across login/signup/provider-login/provider-signup and to main.config.cjs). */
const main = require('./main.config.cjs');
module.exports = {
  darkMode: main.darkMode,
  content: [
    './public/pages/login.html',
    './public/pages/signup.html',
    './public/pages/provider-login.html',
    './public/pages/provider-signup.html',
  ],
  theme: main.theme,
  plugins: main.plugins,
};
