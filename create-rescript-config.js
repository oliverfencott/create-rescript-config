#!/usr/bin/env node

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
const { print, printLine, clear } = require('./ui');

/**
 *
 * @param {string} file
 */
const resolvePath = file => path.resolve(process.cwd(), file);

const YARN_LOCK = 'yarn.lock';
const BS_CONFIG = 'bsconfig.json';
const PACKAGE_JSON = 'package.json';
const RESCRIPT_PACKAGE = 'bs-platform';
const REACT_PACKAGE = 'react';
const REACT_DOM_PACKAGE = 'react-dom';
const RESCRIPT_REACT_PACKAGE = '@rescript/react';

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
    config['bs-dependencies'].push(RESCRIPT_REACT_PACKAGE);
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
 * @param {string} message
 * @returns [string]
 */
const makeErrorMessage = message => [
  chalk`{bold.red Error}: Unable to write {bold ${message}}`
];

/**
 *
 * @param {string} message
 * @returns [string]
 */
const makeSuccessMessage = message => [
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
    .then(() => makeSuccessMessage(file))
    .catch(() => makeErrorMessage(file));

/**
 *
 * @param {string} filePath
 * @returns Promise<boolean>
 */
const pathExists = filePath =>
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

  const directoryExists = await pathExists(dir);

  if (directoryExists) {
    return [];
  }

  const file = 'Index.res';
  const program =
    `// Generated by create-rescript-config\n\n` +
    `let default = () => "Hello, world!"->Js.log`;
  const fullPath = source.dir + '/' + file;

  return fs
    .mkdir(dir)
    .then(() =>
      fs
        .writeFile(path.join(dir, file), program)
        .then(() => makeSuccessMessage(fullPath))
        .catch(() => makeErrorMessage(fullPath))
    )
    .catch(() => makeErrorMessage(source.dir));
};

const run = async () => {
  const bsConfigAlreadyPresent = await pathExists(BS_CONFIG);

  if (bsConfigAlreadyPresent) {
    print(
      chalk`{bold.red Aborting}: {bold ${BS_CONFIG}} file already present in current directory.`
    );
    printLine();
    return;
  }

  const useYarn = await pathExists(YARN_LOCK);
  const pkg = await readPackageJSON().then(assignPackageJsonDefaults);

  const validateCommand = input => {
    if (pkg.scripts[input]) {
      return `Script "${input}" already exists, please pick another`;
    }

    return input.trim().length > 0;
  };

  const commandPrefix = useYarn ? 'yarn' : 'npm run';

  /**
   * @type {CommandOptions}
   */
  const options = await prompt([
    {
      type: 'input',
      name: 'name',
      message: 'Project name',
      default: pkg.name,
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
      suffix: ` e.g. "${commandPrefix} res:build"`,
      default: pkg.scripts['res:build'] ? '' : 'res:build',
      validate: validateCommand
    },
    {
      type: 'input',
      name: 'watchCommand',
      message: 'Watch command',
      suffix: ` e.g. "${commandPrefix} res:watch"`,
      default: pkg.scripts['res:watch'] ? '' : 'res:watch',
      validate: validateCommand
    },
    {
      type: 'input',
      name: 'cleanCommand',
      message: 'Clean command',
      suffix: ` e.g. "${commandPrefix} res:clean"`,
      default: pkg.scripts['res:clean'] ? '' : 'res:clean',
      validate: validateCommand
    }
  ]);

  options.name = options.name.trim();
  options.src = options.src.trim();

  pkg.name = pkg.name || options.name;
  pkg.scripts[options.cleanCommand.trim()] = 'bsb -clean-world';
  pkg.scripts[options.buildCommand.trim()] = 'bsb -make-world';
  pkg.scripts[options.watchCommand.trim()] = 'bsb -make-world -w';

  clear();

  print(chalk`{bold ${PACKAGE_JSON}} will be overwritten with:`);
  printLine();
  print(JSON.stringify(pkg, null, 2));

  const { proceed } = await prompt({
    type: 'confirm',
    name: 'proceed',
    message: 'Continue?'
  });

  if (proceed) {
    const addReScript =
      !pkg.dependencies[RESCRIPT_PACKAGE] &&
      !pkg.devDependencies[RESCRIPT_PACKAGE];

    const addReact = options.addReact && !pkg.dependencies[REACT_PACKAGE];

    const addReasonReact =
      options.addReact && !pkg.dependencies[RESCRIPT_REACT_PACKAGE];

    const dependencies = [
      addReScript && RESCRIPT_PACKAGE,
      addReact && [REACT_PACKAGE, REACT_DOM_PACKAGE],
      addReasonReact && RESCRIPT_REACT_PACKAGE
    ]
      .flat()
      .filter(Boolean)
      .join(' ');

    let runMessage = useYarn
      ? `${dependencies && `yarn add ${dependencies} &&`} yarn ${
          options.watchCommand
        }`
      : `${dependencies && `npm install ${dependencies} --save &&`} npm run ${
          options.watchCommand
        }`;

    const bsConfig = makeBsConfig(options);

    const fileWriteMessages = (
      await Promise.all([
        writeJson(PACKAGE_JSON, pkg),
        writeJson(BS_CONFIG, bsConfig),
        writeSrcDirectory(bsConfig)
      ])
    ).flat();

    clear();
    fileWriteMessages.forEach(print);
    printLine();
    print(chalk`Now run:`);
    printLine();
    print(chalk`  {bold ${runMessage}}`);
    printLine();
  }
};

run();
