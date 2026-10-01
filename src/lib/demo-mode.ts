type RolePreviewEnvironment = {
  NODE_ENV?: string;
  ALLOW_DEMO?: string;
};

export function isRolePreviewEnabled(
  environment: RolePreviewEnvironment = process.env,
) {
  return (
    environment.NODE_ENV !== "production" && environment.ALLOW_DEMO === "true"
  );
}
