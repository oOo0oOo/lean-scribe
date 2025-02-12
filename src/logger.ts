import * as fs from 'fs';
import * as path from 'path';
import { getScribeFolderPath } from './utils';

export class Logger {
    private static instance: Logger;
    private logDir?: string;

    private constructor() { }

    static getInstance(): Logger {
        if (!Logger.instance) {
            Logger.instance = new Logger();
        }
        return Logger.instance;
    }

    setLogDir(logDir: string = 'logs') {
        const scribeFolderPath = getScribeFolderPath();
        if (!scribeFolderPath) {
            return;
        }
        this.logDir = path.join(scribeFolderPath, logDir);
        if (!fs.existsSync(this.logDir)) {
            fs.mkdirSync(this.logDir, { recursive: true });
        }
    }

    getLogUri(line: number) {
        return "file://" + this.getLogFilePath() + "#" + line;
    }

    getLogFilePath(): string {
        if (!this.logDir) {
            this.setLogDir();
        }
        const date = new Date().toISOString().split('T')[0];
        return path.join(this.logDir!, `${date}.md`);
    }

    log(message: string): string {
        const logFilePath = this.getLogFilePath();
        let lines = 0;
        if (fs.existsSync(logFilePath)) {
            const data = fs.readFileSync(logFilePath, 'utf8');
            lines = data.split('\n').length;
        }

        const timestamp = new Date().toISOString();
        const logMessage = `[${timestamp}] ${message}\n`;
        fs.appendFileSync(logFilePath, logMessage);

        return "file://" + logFilePath + "#" + lines;
    }
}

export const logger = Logger.getInstance();