// Worker entry: only the fetch handler is exported (workerd rejects non-handler named exports).
export { default } from "../../src/http.js";
export type { Env } from "../../src/http.js";
