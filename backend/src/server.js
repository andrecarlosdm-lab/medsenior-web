const app = require('./app');
const env = require('./config/env');
const db = require('./config/db');
const { runSeed } = require('./services/seedService');

async function bootstrap() {
  await db.query('select 1');

  if (env.seedOnStart) {
    await runSeed();
    console.log('Seed executado com sucesso.');
  }

  app.listen(env.port, () => {
    console.log(`Servidor MedSenior rodando na porta ${env.port}`);
  });
}

bootstrap().catch((error) => {
  console.error('Falha ao iniciar o servidor:', error);
  process.exit(1);
});
