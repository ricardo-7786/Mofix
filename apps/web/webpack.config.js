// apps/web/webpack.config.js
const path = require('path');
const fs = require('fs');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const webpack = require('webpack');
const dotenv = require('dotenv');

// ── .env.local 우선, 없으면 .env ───────────────────────────────
const envPath = fs.existsSync(path.resolve(__dirname, '.env.local'))
  ? path.resolve(__dirname, '.env.local')
  : path.resolve(__dirname, '.env');
dotenv.config({ path: envPath });

module.exports = {
  entry: path.resolve(__dirname, 'src/client/index.tsx'),
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: 'bundle.js',
    publicPath: '/',
    clean: true,
  },
  mode: process.env.NODE_ENV === 'production' ? 'production' : 'development',
  resolve: { extensions: ['.ts', '.tsx', '.js', '.jsx', '.json'] },
  module: {
    rules: [
      { test: /\.[tj]sx?$/, loader: 'ts-loader', exclude: /node_modules/ },
      { test: /\.css$/, use: ['style-loader', 'css-loader', 'postcss-loader'] },
      {
        test: /\.(png|jpe?g|gif|svg)$/i,
        type: 'asset/resource',
        generator: { filename: 'assets/[name][ext]' },
      },
    ],
  },
  devServer: {
    port: 5002,
    historyApiFallback: true,
  },
  plugins: [
    new HtmlWebpackPlugin({
      template: path.resolve(__dirname, 'src/client/index.html'),
    }),

    // ✅ 브라우저 번들에 공개 환경변수 주입
    //    끝의 슬래시는 제거 (우리 코드가 `${API_BASE}/...` 형태라 // 방지)
    new webpack.DefinePlugin({
      'process.env.NEXT_PUBLIC_FUNCTIONS_URL': JSON.stringify(
        (process.env.NEXT_PUBLIC_FUNCTIONS_URL || '').replace(/\/+$/, '')
      ),
    }),
  ],
};
