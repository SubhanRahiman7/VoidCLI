import "dotenv/config";
import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import chalk from "chalk";
import { runAgent } from "./agent.js";
import { renderBanner, renderPrompt } from "./theme.js";

let exitRequested = false;

async function main(): Promise<void> {
  renderBanner();
  console.log(chalk.gray("Using 1 design spec and Vertex AI Gemini backend"));
  let shouldExit = false;
  let rl = readline.createInterface({ input, output });

  const wireReadline = (): void => {
    rl.on("SIGINT", () => {
      shouldExit = true;
      exitRequested = true;
      console.log(chalk.yellow("\nExiting on Ctrl+C."));
      rl.close();
    });
  };

  wireReadline();

  try {
    while (!shouldExit) {
      if ((rl as unknown as { closed?: boolean }).closed) {
        rl = readline.createInterface({ input, output });
        wireReadline();
      }

      let userInput = "";
      try {
        userInput = await rl.question(renderPrompt());
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (/readline was closed|aborted|canceled|interface is closed/i.test(message)) {
          if (!shouldExit) {
            rl = readline.createInterface({ input, output });
            wireReadline();
            console.log(chalk.gray("Input channel reopened. Continuing session.\n"));
            continue;
          }
          break;
        }
        console.error(chalk.red(`Input error: ${message}`));
        continue;
      }
      const clean = userInput.trim();
      if (!clean) continue;
      if (clean.toLowerCase() === "exit" || clean.toLowerCase() === "quit") {
        shouldExit = true;
        exitRequested = true;
        break;
      }

      try {
        const result = await runAgent(clean);

        if (result.generatedFiles.length > 0) {
          console.log(chalk.bold("\nGenerated files:"));
          for (const file of result.generatedFiles) {
            console.log(chalk.green(`- ${file}`));
          }
        }
        console.log(chalk.gray("\nAsk another task, or type exit.\n"));
        void result.output;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(chalk.red(`Run failed: ${message}`));
        console.log(chalk.gray("Continuing session. Ask another task, or type exit.\n"));
      }
    }
  } finally {
    if (!(rl as unknown as { closed?: boolean }).closed) {
      rl.close();
    }
  }
}

async function startCli(): Promise<void> {
  while (!exitRequested) {
    try {
      await main();
      if (!exitRequested) {
        console.log(chalk.gray("Session ended unexpectedly. Restarting...\n"));
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(chalk.red(`Unexpected runtime error: ${message}`));
      console.log(chalk.gray("Restarting CLI session...\n"));
    }
  }
}

void startCli();
