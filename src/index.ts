#!/usr/bin/env node

import { Mistral } from "@mistralai/mistralai";
import chalk from "chalk";
import "dotenv/config";
import gradient from "gradient-string";
import * as readline from "readline";
import { processCommand } from "./commands.js";
import { SYSTEM_PROMPT } from "./prompt.js";

const apiKey = process.env.MISTRAL_API_KEY || "";
if (!apiKey) {
  console.error(
    chalk.red.bold("✗ Error: MISTRAL_API_KEY environment variable is required")
  );
  console.error(
    chalk.yellow(
      "Please set it in your .env file or export it as an environment variable"
    )
  );
  process.exit(1);
}

const systemPrompt = SYSTEM_PROMPT;

const client = new Mistral({ apiKey });

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  prompt: "> ",
});

const conversationHistory: Array<{
  role: "user" | "assistant" | "tool";
  content: string;
  toolCallId?: string;
  toolCalls?: Array<{
    id: string;
    type: string;
    function: {
      name: string;
      arguments: string;
    };
  }>;
}> = [];

const mistralGradient = gradient(["#ffd800", "#ffaf00", "#ff8203", "#e10300"]);
console.log(
  mistralGradient.multiline(`        
▗▖  ▗▖▗▄▄▄▖ ▗▄▄▖▗▄▄▄▖▗▄▄▖  ▗▄▖ ▗▖        ▗▄▄▖ ▗▄▖ ▗▄▄▄ ▗▄▄▄▖
▐▛▚▞▜▌  █  ▐▌     █  ▐▌ ▐▌▐▌ ▐▌▐▌       ▐▌   ▐▌ ▐▌▐▌  █▐▌   
▐▌  ▐▌  █   ▝▀▚▖  █  ▐▛▀▚▖▐▛▀▜▌▐▌       ▐▌   ▐▌ ▐▌▐▌  █▐▛▀▀▘
▐▌  ▐▌▗▄█▄▖▗▄▄▞▘  █  ▐▌ ▐▌▐▌ ▐▌▐▙▄▄▖    ▝▚▄▄▖▝▚▄▞▘▐▙▄▄▀▐▙▄▄▖
`)
);
console.log(
  chalk.gray('Type your commands (or "help" for help, "exit" to quit)\n')
);
rl.prompt();

rl.on("line", (input) => {
  processCommand(input, client, systemPrompt, conversationHistory, rl);
});

rl.on("close", () => {
  console.log(chalk.cyan("\n👋 Session ended."));
  process.exit(0);
});
