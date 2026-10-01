import { isDemoAllowed, type AppEnvironmentVariables } from "./app-environment";

export function isRolePreviewEnabled(
  environment: AppEnvironmentVariables = process.env,
) {
  return isDemoAllowed(environment);
}
