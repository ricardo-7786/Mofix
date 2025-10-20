import chalk from 'chalk';

export class Logger {
  info(message: string): void {
    console.log(chalk.blue('ℹ'), message);
  }

  success(message: string): void {
    console.log(chalk.green('✓'), message);
  }

  warning(message: string): void {
    console.log(chalk.yellow('⚠'), message);
  }

  error(message: string): void {
    console.log(chalk.red('✗'), message);
  }

  step(message: string): void {
    console.log(chalk.cyan('→'), message);
  }

  log(message: string): void {
    console.log(message);
  }

  newLine(): void {
    console.log();
  }
}