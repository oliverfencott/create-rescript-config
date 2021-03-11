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
const { prompt } = require('inquirer');
const chalk = require('chalk');
const pkg = require('./package.json');

/**
 *
 * @param {string} file
 */
const resolvePath = file => path.resolve(process.cwd(), file);

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

const readPackageJSON = async () => {
  const file = await fs
    .readFile(resolvePath(PACKAGE_JSON), {
      encoding: 'utf-8'
    })
    .catch(_e => undefined);

  /** Safe parse */
  try {
    return JSON.parse(file);
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
  const { buildCommand, cleanCommand, watchCommand } = options;

  /** Add name to package.json if not present */
  if (!config.name) {
    config.name = options.name;
  }

  config.scripts[cleanCommand] = 'bsb -clean-world';
  config.scripts[buildCommand] = 'bsb -make-world';
  config.scripts[watchCommand] = 'bsb -make-world -w';

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
 * @param {string} filePath
 * @returns Promise<boolean>
 */
const validatePathExists = filePath =>
  fs
    .access(filePath)
    .then(_ => true)
    .catch(_e => false);
/**
 *
 * @param {BsConfig} config
 */
const writeSrcDirectory = async config => {
  const [source] = config.sources;
  const dir = resolvePath(source.dir);

  const directoryExists = await validatePathExists(dir);

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
  const version = `v${pkg.version}`;
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

  const bsConfigAlreadyPresent = await validatePathExists(BS_CONFIG);

  if (bsConfigAlreadyPresent) {
    log(
      chalk`{bold.red Aborting}: {bold ${BS_CONFIG}} file already present in current directory.`
    );
    logLine();
    return;
  }

  const useYarn = await validatePathExists('yarn.lock');

  const startPackageJSON = await readPackageJSON().then(
    assignPackageJsonDefaults
  );

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

    const dependencies = [
      !rescriptAlreadyInstalled && RESCRIPT_PACKAGE,

      options.addReact &&
        !packageJson.dependencies[REACT_PACKAGE] && [
          REACT_PACKAGE,
          REACT_DOM_PACKAGE
        ],
      options.addReact &&
        !packageJson.dependencies[REASON_REACT_PACKAGE] &&
        REASON_REACT_PACKAGE
    ]
      .flat()
      .filter(Boolean)
      .join(' ');

    let message = useYarn
      ? `yarn add ${dependencies} && yarn ${options.watchCommand}`
      : `npm install ${dependencies} --save && npm install ${options.watchCommand}`;

    logLine();
    log(chalk`Now run:`);
    logLine();

    log(chalk`  {bold ${message}}`);

    logLine();
  }
};

run();
