import express from 'express';
import connectDB, { DB_URL } from '@/configs/db/mongodb';
import logger from '@/configs/logger';
import env from '@/configs/env';
import createApp from '@/configs/server.config';
import { initializeCronJobs } from './configs/cron';

const app = createApp();

connectDB()
  .then(() => {
    logger.info('Running Status : Database connected');
    logger.info(`Running Status : DB URL \n${DB_URL} 🚀`);
    initializeCronJobs();
  })
  .catch((err) => {
    logger.error('Database Connection Failed', err);
    process.exit();
  });

const server = app.listen(env.PORT, () => {
  logger.info(
    `Running Status : Server started on port http://localhost:${env.PORT}`
  );
});

process.on('unhandledRejection', (err) => {
  logger.error('Unhandled rejection', err);
  server.close(() => process.exit(1));
});
