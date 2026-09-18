import 'reflect-metadata';
import './load-database-environment';
import { DataSource } from 'typeorm';
import { loadAppConfig } from '../config/app-config';
import { createTypeOrmOptions } from './database-options';

export const AppDataSource = new DataSource(
  createTypeOrmOptions(loadAppConfig()),
);
