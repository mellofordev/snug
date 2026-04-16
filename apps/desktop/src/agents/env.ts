/** Expand PATH so CLI detection and spawned agents find common install locations. */
export function buildAgentEnv(): NodeJS.ProcessEnv {
  const extraPaths = [
    "/usr/local/bin",
    "/usr/bin",
    "/bin",
    "/opt/homebrew/bin",
    `${process.env.HOME}/.npm-global/bin`,
    `${process.env.HOME}/.local/bin`,
    `${process.env.HOME}/.nvm/versions/node/current/bin`
  ].join(":");

  return {
    ...process.env,
    PATH: `${extraPaths}:${process.env.PATH ?? ""}`,
    FORCE_COLOR: "0",
    NO_COLOR: "1"
  };
}
