#!/usr/bin/env node
import { runCli } from '../src/core/cli.js';

runCli(process.argv.slice(2))
  .then((exitCode) => {
    process.exit(exitCode);
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
