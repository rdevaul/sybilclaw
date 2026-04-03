import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Command } from "commander";
import { theme } from "../terminal/theme.js";
import { formatHelpExamples } from "./help-format.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function registerMigrateCommand(program: Command) {
  program
    .command("migrate")
    .description("Migrate an existing ~/.openclaw installation to ~/.sybilclaw")
    .option("-y, --yes", "Skip confirmation prompt", false)
    .option("-f, --force", "Allow migration even if ~/.sybilclaw exists", false)
    .option("--include-logs", "Also copy logs/ directory (skipped by default)", false)
    .option("--dry-run", "Print what would happen without doing it", false)
    .option("--source <dir>", "Use custom source directory (default: ~/.openclaw)")
    .option("--dest <dir>", "Use custom destination (default: ~/.sybilclaw)")
    .addHelpText(
      "after",
      () =>
        `\n${theme.heading("Examples:")}\n${formatHelpExamples([
          ["sybilclaw migrate", "Interactive migration from ~/.openclaw to ~/.sybilclaw"],
          ["sybilclaw migrate --yes", "Skip confirmation prompt"],
          ["sybilclaw migrate --dry-run", "Preview what would be migrated"],
          ["sybilclaw migrate --force", "Migrate even if ~/.sybilclaw exists (backs up first)"],
          ["sybilclaw migrate --include-logs", "Also copy logs/ directory (skipped by default)"],
        ])}\n\n${theme.muted("The migration keeps ~/.openclaw intact as a backup.")}\n${theme.muted("See log at: ~/.sybilclaw-migration.log")}\n`,
    )
    .action(async (opts) => {
      // Resolve the path to the migration script
      const scriptPath = path.resolve(__dirname, "../../scripts/migrate-to-sybilclaw.sh");

      // Build args from options
      const args: string[] = [];
      if (opts.yes) {
        args.push("--yes");
      }
      if (opts.force) {
        args.push("--force");
      }
      if (opts.includeLogs) {
        args.push("--include-logs");
      }
      if (opts.dryRun) {
        args.push("--dry-run");
      }
      if (opts.source) {
        args.push("--source", opts.source);
      }
      if (opts.dest) {
        args.push("--dest", opts.dest);
      }

      // Run the migration script
      const child = spawn("bash", [scriptPath, ...args], {
        stdio: "inherit",
        env: process.env,
      });

      // Wait for the script to complete
      const exitCode = await new Promise<number>((resolve) => {
        child.on("close", (code) => {
          resolve(code ?? 1);
        });
      });

      // Exit with the same code as the script
      if (exitCode !== 0) {
        process.exit(exitCode);
      }
    });
}
