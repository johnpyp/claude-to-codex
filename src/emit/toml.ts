import { stringify } from "@iarna/toml";

export function renderToml(value: Record<string, unknown>): string {
  return stringify(value as never).trimEnd() + "\n";
}
