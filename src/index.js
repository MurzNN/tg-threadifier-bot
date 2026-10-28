/**
 * Placeholder entrypoint until the TypeScript bot scaffold lands (roadmap M0).
 * Keeps the Docker image runnable for CI publish dry-runs.
 */
console.log("threadifier-bot: placeholder process started");

const shutdown = (signal) => {
  console.log(`threadifier-bot: received ${signal}, exiting`);
  process.exit(0);
};

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

setInterval(() => {}, 1 << 30);
