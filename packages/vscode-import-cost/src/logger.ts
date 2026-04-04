import { EventEmitter } from 'events';
import * as vscode from 'vscode';

class Logger {
  channel?: vscode.OutputChannel;
  emitter?: EventEmitter;

  log(text: string): void {
    if (
      vscode.workspace.getConfiguration('importCost').debug &&
      !this.channel
    ) {
      this.channel = vscode.window.createOutputChannel('ImportCost');
    }
    this.channel?.appendLine(text);
    this.emitter = this.emitter || new EventEmitter();
    this.emitter.emit('log', text);
  }

  onLog(listener: (text: string) => void): void {
    this.emitter = this.emitter || new EventEmitter();
    this.emitter.on('log', listener);
  }

  dispose(): void {
    this.channel?.dispose();
    this.channel = undefined;
  }
}

export default new Logger();
