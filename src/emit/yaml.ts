import { stringify } from "yaml";

import { yamlStringifyOptions } from "../utils/yaml-stringify.js";

export function renderYaml(value: unknown): string {
  return stringify(value, yamlStringifyOptions).trimEnd() + "\n";
}
