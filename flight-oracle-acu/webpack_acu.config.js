const path = require("path");

module.exports = {
  // Production mode: minifies output and disables source maps
  mode: "production",

  entry: "./src/index_acu.ts",

  output: {
    filename: "bundle.js",
    path: path.resolve(__dirname, "dist"),
    // Clean dist before each build
    clean: true,
  },

  // Target Node.js — Acurast processors run Node.js v20
  target: "node",

  resolve: {
    extensions: [".ts", ".js"],
  },

  module: {
    rules: [
      {
        test: /\.ts$/,
        use: "ts-loader",
        exclude: /node_modules/,
      },
    ],
  },

  // Do not bundle these — they are available natively in Node.js v20
  externals: {
    // crypto, fs, path etc. are built-ins; webpack will leave them as require() calls
    // which is correct since Acurast runs Node.js v20 natively
  },

  optimization: {
    // Keep readable enough for debugging on the processor
    minimize: false,
  },
};
