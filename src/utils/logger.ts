export type LogLevel = 'info' | 'warn' | 'error' | 'debug';

class Logger {
  private getTimestamp(): string {
    return new Date().toISOString();
  }

  private formatMessage(level: LogLevel, message: string, ...args: any[]): string {
    return `[${this.getTimestamp()}] [${level.toUpperCase()}] ${message}`;
  }

  public info(message: string, ...args: any[]) {
    console.log(this.formatMessage('info', message), ...args);
  }

  public warn(message: string, ...args: any[]) {
    console.warn(this.formatMessage('warn', message), ...args);
  }

  public error(message: string, ...args: any[]) {
    console.error(this.formatMessage('error', message), ...args);
  }

  public debug(message: string, ...args: any[]) {
    if (process.env.NODE_ENV === 'development') {
      console.debug(this.formatMessage('debug', message), ...args);
    }
  }
}

export const logger = new Logger();
