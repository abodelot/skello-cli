const chalk = require('chalk');
const openInBrowser = require('open');
const fetch = require('node-fetch');
const _ = require('lodash');
const moment = require('moment');
const currentBranchName = require('current-git-branch');
const cliSelect = require('cli-select');
const figures = require('figures');
const ora = require('ora');

// Services
const HerokuService = require('../services/heroku.js');

/*
* [HELP] tests help message
*/
const helpText =
`
${chalk.bold('NAME')}
    skello-tests Manage pending tests

${chalk.bold('SYNOPSIS')}
    ${chalk.underline('skello')} ${chalk.underline('tests')} ${chalk.underline('status')}
`;

/*
* [COMMAND] skello tests status: 
*/
async function status(branchName) {
  if (!branchName || branchName === '') {
    console.log('Please enter a valid branch name or the current keyword.');
    return;
  }

  branchName = branchName === 'current' ? currentBranchName() : branchName;

  const result = await parseTestFailuresFor(branchName);

  Object.keys(result).forEach((nodeId) => {
    console.log(`Node #${nodeId}`);

    if (result[nodeId].length === 0) {
      console.log('   Failures parsing for this node not implemented.');
    } else {
      result[nodeId].forEach((error) => {
        console.log(`   ${error}`);
      });
    }
  });
}

/*
* [COMMAND] skello tests list:
*/
async function list() {
  const spinner = ora(`Loading failed test runs...`).start();
  let tests = await HerokuService.listTestRuns();
  spinner.stop();

  tests = _.sortBy(tests, (test) => moment(test.updated_at).format('X')).reverse();
  tests = _.filter(tests, (test) => test.status === 'failed');
  const values = _.uniqBy(tests, (test) => test.commit_branch);
  
  console.log(`${chalk.red.bold('?')} Please choose a branch:`);

  cliSelect({
    values: values,
    valueRenderer: (value, selected) => {
      let icon;

      switch(value.status) {
        case 'succeeded':
          icon = chalk.green.bold(figures.tick);
          break;
        case 'failed':
          icon = chalk.red.bold(figures.cross);
          break;
        default:
          icon = chalk.orange.bold(figures.ellipsis);
          break;
      }

      if (selected) {
        return `${icon} [${chalk.blue.bold.underline(value.commit_branch)}] ${chalk.blue.bold(value.commit_message)}`;
      }

      return `${icon} [${value.commit_branch}] ${value.commit_message}`;
    },
    selected: chalk.blue(figures.circleFilled),
    unselected: figures.circle,
  }).then(async function(response) {
      const spinner = ora(`Loading failures ouput...`).start();
      const result = await parseTestFailuresFor(response.value.commit_branch);
      spinner.stop();
      
      Object.keys(result).forEach((nodeId) => {
        console.log(`Node #${nodeId}`);

        if (result[nodeId].length === 0) {
          console.log('   Failures parsing for this node not implemented.');
        } else {
          result[nodeId].forEach((error) => {
            console.log(`   ${error}`);
          });
        }
      });
    })
    .catch(error => null)
}

async function parseTestFailuresFor(branchName) {
  const tests = await HerokuService.listTestRuns();
  const test = tests.find(t => t.commit_branch === branchName);
  let nodes = await HerokuService.listTestNodes(test.id);

  if (test.status === 'succeeded') {
    console.log('All tests passed successfully.');    
    return;
  }

  nodes = _.sortBy(nodes, (node) => node.index);
  const result = {};

  for (var i = nodes.length - 1; i >= 0; i--) {
    let node = nodes[i]

    if (node.status === 'failed') {
      const res = await fetch(node.output_stream_url);
      const data = await res.text();

      result[node.index] = [];

      data.split('\n').forEach((line) => {
        const match = line.match(/^rspec\s+(.+):(\d+)/)

        if (match) {
          result[node.index].push(match[0]);
        }
      });
    }
  }

  return result;
}

module.exports = {
  helpText,
  status,
  list,
};