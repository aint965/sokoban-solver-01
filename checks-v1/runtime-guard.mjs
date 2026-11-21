// Used only by verify.mjs: deny nondeterministic clock/random/network APIs.
import { syncBuiltinESMExports } from 'node:module';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const denied = () => { throw new Error('Forbidden clock, random, or network API'); };
const OriginalDate = Date;
globalThis.Date = class extends OriginalDate {
  constructor(...args) { if (!args.length) denied(); super(...args); }
  static now = denied;
};
Math.random = denied;
globalThis.fetch = denied;
globalThis.WebSocket = denied;
Object.defineProperty(globalThis.performance, 'now', { value: denied });
process.hrtime = Object.assign(denied, { bigint: denied });
process.uptime = denied;
process.cpuUsage = denied;
for (const [module, names] of [
  ['node:net', ['connect', 'createConnection', 'createServer']],
  ['node:tls', ['connect', 'createServer']],
  ['node:http', ['request', 'get', 'createServer']],
  ['node:https', ['request', 'get', 'createServer']],
  ['node:dgram', ['createSocket']],
  ['node:dns', ['lookup', 'resolve']],
]) {
  const api = require(module);
  for (const name of names) api[name] = denied;
}
require('node:net').Socket.prototype.connect = denied;
syncBuiltinESMExports();
