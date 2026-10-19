#!/usr/bin/env node
// Точка входа. Вся логика — в src/, здесь только запуск и аккуратный вывод ошибок.
import { main } from '../src/cli.js';
import { reportError } from '../src/errors.js';

// Вывод могут оборвать, например «mgen models | head». Это не ошибка.
for (const stream of [process.stdout, process.stderr]) {
  stream.on('error', (error) => {
    if (error?.code === 'EPIPE') process.exit(0);
    throw error;
  });
}

main(process.argv.slice(2)).catch((error) => {
  reportError(error);
  process.exit(1);
});
