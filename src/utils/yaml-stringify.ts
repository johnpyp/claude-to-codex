import type { ToStringOptions } from "yaml";

/** Disable the library default 80-column fold so emitted YAML stays on single lines where possible. */
export const yamlStringifyOptions: ToStringOptions = {
  lineWidth: 0,
};
