// Подтверждение перед тратой денег. Флаг --yes пропускает вопрос (нужен Claude Code).
import readline from 'node:readline';
import { say, bold, dim } from './ui.js';

export function ask(question) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim().toLowerCase());
    });
  });
}

/** Скрытый ввод: ключ не виден на экране и не остаётся в истории терминала. */
export function askSecret(question) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      terminal: Boolean(process.stdin.isTTY),
    });
    // Печатаем только сам вопрос, набираемые символы не показываем.
    rl._writeToOutput = (chunk) => {
      if (typeof chunk === 'string' && chunk.includes(question)) rl.output.write(question);
    };
    rl.question(question, (answer) => {
      rl.close();
      process.stdout.write('\n');
      resolve(answer.trim());
    });
  });
}

export async function confirm({ yes }) {
  if (yes) return true;
  if (!process.stdin.isTTY) {
    say(dim('Вопрос задать некому (команда запущена не из терминала) — добавь --yes, если согласен заранее.'));
    return false;
  }
  const answer = await ask(`${bold('Запускаем?')} [д/н] `);
  return ['д', 'да', 'y', 'yes', 'ага', ''].includes(answer);
}
