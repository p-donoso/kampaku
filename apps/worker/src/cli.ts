#!/usr/bin/env node
import { Command } from "commander";
import { loadWorkerConfig } from "./config.js";
import { runJobLoop } from "./job-runner/loop.js";

const program = new Command();

program
  .name("apps/worker")
  .description("Kampaku execution plane worker")
  .version("0.1.0");

program
  .command("run")
  .description("Register with Core and poll for jobs")
  .action(async () => {
    let config;
    try {
      config = loadWorkerConfig();
    } catch (error) {
      console.error(error instanceof Error ? error.message : "Invalid worker configuration");
      process.exitCode = 1;
      return;
    }
    if (config.executorMode === "openai-compatible" && !config.modelApiKey) {
      console.error(
        "KAMPAKU_MODEL_API_KEY is required for model-backed task execution. Set it in the workspace .env, or explicitly use KAMPAKU_EXECUTOR=echo only for smoke tests.",
      );
      process.exitCode = 1;
      return;
    }
    console.log(`Executor mode: ${config.executorMode}`);
    await runJobLoop(config);
  });

program.parse();
