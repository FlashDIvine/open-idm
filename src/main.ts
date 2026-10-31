#!/usr/bin/env node
import { runCli } from "./cli.ts";

runCli(process.argv).catch((err) => {
  console.error("LIDM Error:", err.message || err);
  process.exit(1);
});
