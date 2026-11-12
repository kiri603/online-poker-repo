import { createGameServer } from './server/game-server.js';
const host = process.env.BATTLE_HOST || '127.0.0.1', port = Number(process.env.BATTLE_PORT || 5188);
const game = createGameServer({ trustProxy: process.env.BATTLE_TRUST_PROXY === '1' });
game.server.listen(port, host, () => console.log(`Battle demo: http://${host}:${port}`));
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => { game.close().then(() => process.exit(0)); });
