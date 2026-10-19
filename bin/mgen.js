#!/usr/bin/env node
// Точка входа. Вся логика — в src/, здесь только запуск и аккуратный вывод ошибок.
import { main } from '../src/cli.js';
import { reportError } from '../src/errors.js';

main(process.argv.slice(2)).catch((error) => {
  reportError(error);
  process.exit(1);
});
