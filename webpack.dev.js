const common = require('./webpack.common.js');
const merge = require('webpack-merge').merge;
const path = require('path');

module.exports = merge(common, {
  mode: 'development',
  devtool: 'inline-source-map',
  // In production the stylesheet is compiled by `bun run build:css` and loaded
  // via a plain <link>, which cannot be hot reloaded. In dev it goes through
  // webpack instead. This overrides the app entry rather than adding one,
  // because index.html only loads app.bundle.js.
  entry: {
    app: ['./src/bootstrap.ts', './src/sass/hmr.js'],
  },
  module: {
    rules: [
      {
        test: /\.scss$/,
        use: [
          'style-loader',
          // url()s point at paths served statically from public/, not at
          // modules webpack should resolve.
          {loader: 'css-loader', options: {url: false, import: false}},
          {
            loader: 'sass-loader',
            options: {sassOptions: {silenceDeprecations: ['import']}},
          },
        ],
      },
    ],
  },
  devServer: {
    static: [
      {directory: path.join(__dirname)},
      {directory: path.join(__dirname, 'public')},
      {directory: path.join(__dirname, 'src')},
    ],
    host: '127.0.0.1',
    port: 9966,
    // Browsing as localhost while bound to 127.0.0.1 is rejected as an
    // "Invalid Host/Origin header", which silently kills the HMR websocket.
    allowedHosts: ['localhost', '127.0.0.1'],
  },
});
