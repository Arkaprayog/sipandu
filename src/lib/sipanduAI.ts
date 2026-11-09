/**
 * Single trusted endpoint for SIPANDU AI.
 *
 * Do not make this host configurable through Vite environment variables:
 * the Copilot sends Firebase ID tokens in the Authorization header.
 * A build-time override could redirect those tokens to an untrusted host.
 */
export const SIPANDU_AI_WORKER_URL = "https://sipandu-ai.aryprayoga139.workers.dev";
