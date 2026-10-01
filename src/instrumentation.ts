export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { validateAppEnvironment } = await import("./lib/app-environment");
  validateAppEnvironment();
}
