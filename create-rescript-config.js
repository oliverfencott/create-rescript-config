#!usr/bin/env node

// @ts-check

'use strict';

const fs = require('fs').promises;
const path = require('path');
const validate = require('validate-npm-package-name');
const Npm = require('npm-api');
const { prompt } = require('inquirer');

const chalk = require('chalk');

/**
 * @typedef {{
 *  name: string,
 *  src: string,
 *  moduleType: string,
 *  moduleSuffix: string,
 *  addReact: boolean,
 *  buildCommand: string,
 *  watchCommand: string,
 *  cleanCommand: string,
 *  addReScript: boolean,
 * }} CommandOptions
 */

/**
 * @typedef {{
 *  name: string,
 *  dependencies: {[key: string]: string},
 *  devDependencies: {[key: string]: string},
 *  scripts: {[key: string]: string},
 * }} PackageJson
 */

/**
 * @typedef {"commonjs" | "es6" | "es6-global"} ModuleType
 */

/**
 * @typedef {".bs.js" | ".mjs" | ".cjs" | ".js"} FileExtension
 */

/**
 * @param {string} repo
 * @returns {Promise<string>}
 */
let fetchVersion = repo => {
  return new Npm()
    .repo(repo)
    .package()
    .then(x => x.version)
    .catch(_e => 'latest');
};

const RESCRIPT_PACKAGE = 'bs-platform';
const REACT_PACKAGE = 'react';
const REACT_DOM_PACKAGE = 'react-dom';
const REASON_REACT_PACKAGE = 'reason-react';

const readFile = file =>
  fs
    .readFile(path.resolve(process.cwd(), file), {
      encoding: 'utf-8'
    })
    .catch(_e => undefined);

const readPackageJSON = () => readFile('package.json');

const safeParse = input => {
  try {
    return JSON.parse(input);
  } catch (error) {
    return {};
  }
};

/** @type ModuleType[] */
const moduleTypes = ['commonjs', 'es6', 'es6-global'];

/** @type FileExtension[] */
const moduleSuffixes = ['.bs.js', '.js', '.mjs', '.cjs'];

/**  @param {string[]} keys */
const makeVersionKeys = keys => version =>
  Object.fromEntries(keys.map(key => [key, version]));

/**
 * @param {CommandOptions} makeBsConfig
 */
const makeBsConfig = ({ name, src, addReact, moduleType, moduleSuffix }) => {
  const config = {
    name,
    namespace: true,
    'bs-dependencies': [],
    'ppx-flags': [],
    sources: [{ dir: src, subdirs: true }],
    'package-specs': {
      'in-source': true,
      module: moduleType,
      suffix: moduleSuffix
    },
    'bsc-flags': ['-bs-super-errors', '-bs-g']
  };

  if (addReact) {
    config['bs-dependencies'].push(REASON_REACT_PACKAGE);
    config.reason = { 'react-jsx': 3 };
  }

  return config;
};

/**
 *
 * @param {PackageJson} config
 * @returns config
 */
const assignPackageJsonDefaults = config => {
  config.scripts = config.scripts || {};
  config.dependencies = config.dependencies || {};
  config.devDependencies = config.devDependencies || {};

  return config;
};

/**
 *
 * @param {PackageJson} config
 * @param {CommandOptions} options
 * @returns config
 */
const setPackageJson = async (config, options) => {
  const {
    buildCommand,
    cleanCommand,
    watchCommand,
    addReScript,
    addReact
  } = options;

  // Add name to package.json if not present
  config.name = config.name || options.name;

  config.scripts[cleanCommand] = 'bsb -clean-world';
  config.scripts[buildCommand] = 'bsb -make-world';
  config.scripts[watchCommand] = 'bsb -make-world -w';

  /** @type Promise<{[key: string]: string}>[] */
  const dependencies = [];

  if (addReScript) {
    dependencies.push(
      fetchVersion(RESCRIPT_PACKAGE).then(makeVersionKeys([RESCRIPT_PACKAGE]))
    );
  }

  if (addReact) {
    if (!config.dependencies[REACT_PACKAGE]) {
      dependencies.push(
        fetchVersion(REACT_PACKAGE).then(
          makeVersionKeys([REACT_PACKAGE, REACT_DOM_PACKAGE])
        )
      );
    }

    if (!config.dependencies[REASON_REACT_PACKAGE]) {
      dependencies.push(
        fetchVersion(REASON_REACT_PACKAGE).then(
          makeVersionKeys([REASON_REACT_PACKAGE])
        )
      );
    }
  }

  config.dependencies = (await Promise.all(dependencies)).reduce(
    (a, b) => Object.assign(a, b),
    config.dependencies
  );

  return config;
};

const receive = async () => {
  const packageJSON = await readPackageJSON()
    .then(safeParse)
    .then(assignPackageJsonDefaults);

  const projectName = packageJSON.name || '';
  const rescriptAlreadyInstalled =
    packageJSON.dependencies[RESCRIPT_PACKAGE] ||
    packageJSON.devDependencies[RESCRIPT_PACKAGE];

  const validateCommand = input => {
    if (packageJSON.scripts[input]) {
      return `Script "${input}" already exists, please pick another`;
    }

    return true;
  };

  const options = await prompt([
    {
      type: 'input',
      name: 'name',
      message: 'Project name',
      default: projectName,
      validate: input => {
        const [error] = validate(input).errors || [];

        return error ? error : true;
      }
    },
    {
      type: 'input',
      name: 'src',
      message: 'Source directory',
      default: 'src'
    },
    {
      type: 'list',
      name: 'moduleType',
      message: 'Module type',
      choices: moduleTypes.map(name => ({
        type: 'choice',
        value: name,
        name
      }))
    },
    {
      type: 'list',
      name: 'moduleSuffix',
      message: 'File extension',
      choices: moduleSuffixes.map(name => ({
        type: 'choice',
        value: name,
        name
      }))
    },
    {
      type: 'confirm',
      default: false,
      name: 'addReact',
      message: 'Add React?'
    },
    {
      type: 'input',
      name: 'buildCommand',
      message: 'Build command',
      suffix: ' e.g. "npm run res:build"',
      default: packageJSON.scripts['res:build'] ? '' : 'res:build',
      validate: validateCommand
    },
    {
      type: 'input',
      name: 'watchCommand',
      message: 'Watch command',
      suffix: ' e.g. "npm run res:watch"',
      default: packageJSON.scripts['res:watch'] ? '' : 'res:watch',
      validate: validateCommand
    },
    {
      type: 'input',
      name: 'cleanCommand',
      message: 'Clean command',
      suffix: ' e.g. "npm run res:clean"',
      default: packageJSON.scripts['res:clean'] ? '' : 'res:clean',
      validate: validateCommand
    }
  ]);

  options.addReScript = !rescriptAlreadyInstalled;

  const bsConfig = makeBsConfig(options);
  const pkg = await setPackageJson(packageJSON, options);

  console.log(bsConfig);
  console.log(pkg);
};

receive();
