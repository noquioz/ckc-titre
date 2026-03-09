import { createApp } from './app.js';

const port = Number.parseInt(process.env.PORT ?? '3001', 10);

const start = async () => {
  const app = await createApp();
  app.listen(port, () => {
    // eslint-disable-next-line no-console
    console.log(`Backend listening on http://localhost:${port}`);
  });
};

start().catch((error) => {
  // eslint-disable-next-line no-console
  console.error(error);
  process.exit(1);
});
