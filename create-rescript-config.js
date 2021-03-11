#!usr/bin/env node

// @ts-check

'use strict';

/**
 *
 * @typedef {{
 *  name: string,
 *  src: string,
 *  moduleType: ModuleType,
 *  fileExtension: FileExtension,
 *  addReact: boolean,
 *  buildCommand: string,
 *  watchCommand: string,
 *  cleanCommand: string,
 *  addReScript: boolean,
 * }} CommandOptions
 */

/**
 *
 * @typedef {{
 *  name: string,
 *  dependencies: {[key: string]: string},
 *  devDependencies: {[key: string]: string},
 *  scripts: {[key: string]: string},
 * }} PackageJson
 */

/**
 *
 * @typedef {"commonjs" | "es6" | "es6-global"} ModuleType
 */

/**
 *
 * @typedef {".bs.js" | ".mjs" | ".cjs" | ".js"} FileExtension
 */

/**
 *
 * @typedef {{
 *  name: string,
 *  namespace: boolean,
 *  'bs-dependencies': string[],
 *  'ppx-flags': string[],
 *  sources: { dir: string, subdirs: boolean }[],
 *  'package-specs': {
 *    'in-source': boolean,
 *    module: ModuleType,
 *    suffix: FileExtension
 *  },
 *  'bsc-flags': string[],
 *  'bs-dev-dependencies': string[],
 *  'bs-external-includes': string[],
 *  'ignored-dirs': string[],
 *  'pinned-dependencies': string[]
 * }} BsConfig
 */

const fs = require('fs').promises;
const path = require('path');
const validate = require('validate-npm-package-name');
const Npm = require('npm-api');
const { prompt } = require('inquirer');
const chalk = require('chalk');
const pkg = require('./package.json');

/**
 *
 * @param {string} file
 */
const resolvePath = file => path.resolve(process.cwd(), file);

/**
 *
 * @param {string} repo
 * @returns {Promise<string>}
 */
let fetchVersion = repo =>
  new Npm()
    .repo(repo)
    .package()
    .then(x => x.version)
    .catch(_e => 'latest');

const BS_CONFIG = 'bsconfig.json';
const PACKAGE_JSON = 'package.json';
const RESCRIPT_PACKAGE = 'bs-platform';
const REACT_PACKAGE = 'react';
const REACT_DOM_PACKAGE = 'react-dom';
const REASON_REACT_PACKAGE = 'reason-react';

/**
 *
 * @param {unknown} x
 * @returns void
 */
const log = x => console.log(x);
const logLine = () => log('');
const readFile = file =>
  fs
    .readFile(resolvePath(file), {
      encoding: 'utf-8'
    })
    .catch(_e => undefined);

const readPackageJSON = () => readFile(PACKAGE_JSON);

const safeParse = input => {
  try {
    return JSON.parse(input);
  } catch (error) {
    return {};
  }
};

/**
 *
 * @type ModuleType[]
 */
const moduleTypes = ['commonjs', 'es6', 'es6-global'];

/**
 *
 * @type FileExtension[]
 */
const moduleSuffixes = ['.bs.js', '.js', '.mjs', '.cjs'];

/**
 *
 * @param {string[]} keys
 */
const makeVersionKeys = keys => version =>
  Object.fromEntries(keys.map(key => [key, version]));

/**
 *
 * @param {CommandOptions} options
 * @returns BsConfig
 */
const makeBsConfig = options => {
  const { name, src, addReact, moduleType, fileExtension } = options;
  const config = {
    name,
    namespace: true,
    'bs-dependencies': [],
    'ppx-flags': [],
    sources: [{ dir: src, subdirs: true }],
    'package-specs': {
      'in-source': true,
      module: moduleType,
      suffix: fileExtension
    },
    'bsc-flags': [],
    'bs-dev-dependencies': [],
    'bs-external-includes': [],
    'ignored-dirs': [],
    'pinned-dependencies': []
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
  config.name = config.name || '';
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

  /** Add name to package.json if not present */
  if (!config.name) {
    config.name = options.name;
  }

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

/**
 *
 * @param {string} message
 * @returns [string]
 */
const makeWriteErrorMessage = message => [
  chalk`{bold.red Error}: Unable to write {bold ${message}}`
];

/**
 *
 * @param {string} message
 * @returns [string]
 */
const makeWriteSuccessMessage = message => [
  chalk`{bold.green Success}: wrote {bold ${message}}`
];

/**
 *
 * @param {string} file
 * @param {PackageJson | BsConfig} config
 */
const writeJson = (file, config) =>
  fs
    .writeFile(resolvePath(file), JSON.stringify(config, null, 2))
    .then(() => makeWriteSuccessMessage(file))
    .catch(() => makeWriteErrorMessage(file));

/**
 *
 * @param {BsConfig} config
 */
const writeSrcDirectory = async config => {
  const [source] = config.sources;
  const dir = resolvePath(source.dir);

  const directoryExists = await fs
    .access(dir)
    .then(_ => true)
    .catch(_e => false);

  if (!directoryExists) {
    const file = 'Index.res';
    const program = [
      `// Generated by create-rescript-config`,
      `let default = () => "Hello, world!"->Js.log`
    ].join('\n\n');

    return fs
      .mkdir(dir)
      .then(() =>
        fs
          .writeFile(path.join(dir, file), program)
          .then(() => makeWriteSuccessMessage(source.dir + '/' + file))
          .catch(() => makeWriteErrorMessage(source.dir + '/' + file))
      )
      .catch(() => makeWriteErrorMessage(source.dir));
  }

  return [];
};

const resetConsole = () => {
  const name = `Create ReScript config`;
  const version = 'v' + pkg.version;
  const message = `${name} ${version}`;

  const padding = '-'.repeat(message.length + 4);

  console.clear();
  log(padding);
  log(chalk`{bold ${name} {green ${version}}}`);

  log(padding);
  logLine();
};

const run = async () => {
  resetConsole();

  const bsConfigAlreadyPresent = await readFile(BS_CONFIG).then(Boolean);

  if (bsConfigAlreadyPresent) {
    log(
      chalk`{bold.red Aborting}: {bold ${BS_CONFIG}} file already present in current directory.`
    );
    logLine();
    return;
  }

  const useYarn = await readFile('yarn.lock')
    .then(() => true)
    .catch(_e => false);

  const startPackageJSON = await readPackageJSON()
    .then(safeParse)
    .then(assignPackageJsonDefaults);

  const rescriptAlreadyInstalled =
    startPackageJSON.dependencies[RESCRIPT_PACKAGE] ||
    startPackageJSON.devDependencies[RESCRIPT_PACKAGE];

  const validateCommand = input => {
    if (startPackageJSON.scripts[input]) {
      return `Script "${input}" already exists, please pick another`;
    }

    return input.trim().length > 0;
  };

  /**
   * @type {CommandOptions}
   */
  const options = await prompt([
    {
      type: 'input',
      name: 'name',
      message: 'Project name',
      default: startPackageJSON.name,
      validate: input => {
        const [error] = validate(input).errors || [];

        return error ? error : true;
      }
    },
    {
      type: 'input',
      name: 'src',
      message: 'Source directory',
      default: 'src',
      validate: input => input.trim().length > 0
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
      name: 'fileExtension',
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
      default: startPackageJSON.scripts['res:build'] ? '' : 'res:build',
      validate: validateCommand
    },
    {
      type: 'input',
      name: 'watchCommand',
      message: 'Watch command',
      suffix: ' e.g. "npm run res:watch"',
      default: startPackageJSON.scripts['res:watch'] ? '' : 'res:watch',
      validate: validateCommand
    },
    {
      type: 'input',
      name: 'cleanCommand',
      message: 'Clean command',
      suffix: ' e.g. "npm run res:clean"',
      default: startPackageJSON.scripts['res:clean'] ? '' : 'res:clean',
      validate: validateCommand
    }
  ]);

  options.src = options.src.trim();
  options.name = options.name.trim();
  options.buildCommand = options.buildCommand.trim();
  options.watchCommand = options.watchCommand.trim();
  options.cleanCommand = options.cleanCommand.trim();
  options.addReScript = !rescriptAlreadyInstalled;

  const bsConfig = makeBsConfig(options);
  const packageJson = await setPackageJson(startPackageJSON, options);

  resetConsole();

  log(chalk`{bold ${PACKAGE_JSON}} will be overwritten with:`);
  logLine();
  log(JSON.stringify(packageJson, null, 2));

  const { proceed } = await prompt({
    type: 'confirm',
    name: 'proceed',
    message: 'Continue?'
  });

  if (proceed) {
    resetConsole();
    const messages = await Promise.all([
      writeJson(PACKAGE_JSON, packageJson),
      writeJson(BS_CONFIG, bsConfig),
      writeSrcDirectory(bsConfig)
    ]);

    messages.flat().forEach(log);

    logLine();
    log(chalk`Now run:`);
    logLine();

    if (useYarn) {
      log(chalk`    {bold yarn && yarn ${options.watchCommand}}`);
    } else {
      log(chalk`    {bold npm install && npm run ${options.watchCommand}}`);
    }

    logLine();
  }
};

run();
