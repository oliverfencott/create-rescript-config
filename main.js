#!/usr/bin/env node

// @ts-check

'use strict';

const { compare } = require('compare-versions');
const chalk = require('chalk');
const ui = require('./ui');

const VERSION = '12';

ui.clear();

if (compare(process.version, VERSION, '<')) {
  ui.print(
    chalk`{bold.red Aborting}: This utility is only compatible with versions of node {bold v${VERSION}} and above`
  );

  ui.printLine();
} else {
  require('./create-rescript-config');
}
