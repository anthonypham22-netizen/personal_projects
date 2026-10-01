export async function submitAuth(
  body: Record<string, unknown>,
  fallbackMessage: string,
) {
  const response = await fetch("/api/auth", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const result = (await response.json()) as { error?: string };
  if (!response.ok) throw new Error(result.error || fallbackMessage);
  window.location.assign("/app");
}
