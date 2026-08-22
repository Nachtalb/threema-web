const path = require('path');
const webpack = require('webpack');
const CopyPlugin = require("copy-webpack-plugin");

const babelOptions = {
  presets: [
    ['@babel/preset-env', {
      corejs: 3,
      useBuiltIns: 'entry',
      targets: {
        firefox: 93,
        chrome: 85,
        opera: 71,
        safari: 16,
        edge: 85,
      },
    }],
  ],
  plugins: [
    ['@babel/plugin-transform-runtime', {
      regenerator: true,
    }],
    ['@babel/plugin-syntax-dynamic-import'],
  ],
};

module.exports = {
  entry: {
    app: './src/bootstrap.ts',
  },
  module: {
    rules: [
      {
        test: /\.ts$/,
        exclude: /node_modules/,
        use: [
          {loader: 'babel-loader', options: babelOptions},
          {loader: 'ts-loader'},
        ],
      },
      {
        test: /\.js$/,
        exclude: /node_modules/,
        use: [
          {loader: 'babel-loader', options: babelOptions},
        ],
      },
    ],
  },
  resolve: {
    extensions: ['.js', '.ts', '.wasm'],
  },
  plugins: [
    new CopyPlugin({
      patterns: [
        {
          from: 'src/userconfig.js',
          to: path.resolve(__dirname, 'dist', 'generated'),
          info: { minimized: true /* Do not minimize / uglify */ },
        },
      ],
    }),
  ],
  output: {
    path: path.resolve(__dirname, 'dist', 'generated'),
    filename: '[name].bundle.js',
    chunkFilename: '[name].[chunkhash].bundle.js',
  },
  experiments: {
    syncWebAssembly: true,
  },
};
