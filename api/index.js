// Vercel serverless entry point. Vercel's Node.js runtime accepts a plain
// (req, res) => {} listener — the same signature http.createServer takes —
// so the real app in server.js is reused unchanged; this file only wires it up.
export { handleRequest as default } from "../server.js";
