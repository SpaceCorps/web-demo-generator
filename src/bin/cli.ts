#!/usr/bin/env node
import { runCli } from '../core/cli.js';

runCli(process.argv.slice(2), {
  isTTY: process.stdin.isTTY ?? false,
})
  .then((exitCode) => {
    process.exit(exitCode);
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
