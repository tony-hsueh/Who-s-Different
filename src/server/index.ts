import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createApp } from './app.js';
import { parsePublicBaseUrl } from './config.js';
import { questionBank } from './questions/bank.js';
import { validateBank } from './questions/validate.js';

const port = Number(process.env.PORT ?? 3000);

// Compiled to dist/server/server/index.js, so ../../client is dist/client.
// Under `tsx src/server/index.ts` the same path misses, so dev serves no UI.
const builtClient = fileURLToPath(new URL('../../client', import.meta.url));
const clientDir = existsSync(builtClient) ? builtClient : undefined;

// A bad bank must stop the server from starting.
validateBank(questionBank);

const { httpServer } = createApp({
  clientDir,
  publicBaseUrl: parsePublicBaseUrl(process.env.PUBLIC_BASE_URL),
});
httpServer.listen(port, '0.0.0.0', () => {
  console.log(`listening on http://0.0.0.0:${port}`);
});
