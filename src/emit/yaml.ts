import YAML from "yaml";

export function renderYaml(value: unknown): string {
  return YAML.stringify(value).trimEnd() + "\n";
}
