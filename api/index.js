// Vercel serverless entry point. Vercel's Node.js runtime accepts a plain
// (req, res) => {} listener — the same signature http.createServer takes —
// so the real app in server.js is reused unchanged; this file only wires it up.
//
// Explicit import + export (rather than `export { handleRequest as default }
// from "../server.js"`) on purpose: that re-export form was observed causing
// Vercel's bundler to resolve the function entry back to the bundled
// server.js itself, which has no default export of its own — see the export
// default added there too, for the same reason, belt and suspenders.
import { handleRequest } from "../server.js";
export default handleRequest;
