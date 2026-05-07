import chalk from "chalk";
import boxen from "boxen";
import gradient from "gradient-string";

const VOIDCLI_BANNER = `██╗   ██╗ ██████╗ ██╗██████╗  ██████╗██╗     ██╗
██║   ██║██╔═══██╗██║██╔══██╗██╔════╝██║     ██║
██║   ██║██║   ██║██║██║  ██║██║     ██║     ██║
╚██╗ ██╔╝██║   ██║██║██║  ██║██║     ██║     ██║
 ╚████╔╝ ╚██████╔╝██║██████╔╝╚██████╗███████╗██║
  ╚═══╝   ╚═════╝ ╚═╝╚═════╝  ╚═════╝╚══════╝╚═╝`;

export function renderBanner(): void {
  const bannerGradient = gradient(["#35b8ff", "#8a6cff", "#ff5ca8"]);
  console.log(bannerGradient.multiline(VOIDCLI_BANNER));
  const panel = boxen(
    [
      chalk.white("Tips for getting started:"),
      chalk.gray("1. Ask questions or request website generation."),
      chalk.gray("2. Be specific for better clone quality."),
      chalk.gray("3. Type `exit` or `quit` to close the CLI.")
    ].join("\n"),
    {
      borderStyle: "round",
      borderColor: "magenta",
      padding: 1
    }
  );
  console.log(panel);
}

export function logStart(content: string): void {
  console.log(chalk.blue(`🚀 START  ${content}`));
}

export function logThink(content: string): void {
  console.log(chalk.cyan(`🧠 THINK  ${content}`));
}

export function logTool(name: string, args: unknown): void {
  console.log(chalk.yellow(`🛠 TOOL   ${name} ${JSON.stringify(args)}`));
}

export function logCheckpoint(toolName: string): void {
  if (toolName === "fetchPage") console.log(chalk.blue("🌐 FETCH  Fetching homepage"));
  if (toolName === "extractAssets") console.log(chalk.hex("#f59e0b")("📦 ASSETS Extracting CSS/JS/images"));
  if (toolName === "downloadAsset") console.log(chalk.hex("#fb7185")("🖼 IMAGES/CSS/JS Downloading asset"));
}

export function logObserve(content: string): void {
  console.log(chalk.magenta(`👀 OBSERVE ${content}`));
}

export function logOutput(content: string): void {
  console.log(chalk.green(`✅ OUTPUT ${content}`));
}

export function renderPrompt(): string {
  return chalk.hex("#a78bfa")("> ");
}
