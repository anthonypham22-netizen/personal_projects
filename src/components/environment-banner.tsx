import type { AppEnvironment } from "@/lib/app-environment";

export function EnvironmentBanner({
  environment,
}: {
  environment: AppEnvironment;
}) {
  if (environment !== "staging") return null;
  return (
    <div className="environment-banner" role="status">
      STAGING — FICTIONAL DATA
    </div>
  );
}
