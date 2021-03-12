// @ts-check

'use strict';

const chalk = require('chalk');
const { version: pkgVersion } = require('./package.json');

/**
 *
 * @param {unknown} x
 * @returns void
 */
const print = x => console.log(x);
const printLine = () => print('');

const clear = () => {
  const name = `Create ReScript config`;
  const version = `v${pkgVersion}`;
  const message = `${name} ${version}`;

  const padding = '-'.repeat(message.length + 4);

  console.clear();

  print(padding);
  print(chalk`{bold ${name} {green ${version}}}`);
  print(padding);

  printLine();
};

module.exports.clear = clear;
module.exports.print = print;
module.exports.printLine = printLine;
