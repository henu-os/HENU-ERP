// ═══════════════════════════════════════════════════════════
// HENU ERP — Electron Main Entry Point
// ═══════════════════════════════════════════════════════════
// Created & Developed By HENU OS PRIVATE LIMITED (www.henuos.in)
// ═══════════════════════════════════════════════════════════

const fs = require('fs');
const path = require('path');
const os = require('os');

const logDir = path.join(process.env.APPDATA || os.tmpdir(), 'HENU ERP');
try { if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true }); } catch (e) {}
const logPath = path.join(logDir, 'startup.log');
function logStep(msg) {
  try {
    fs.appendFileSync(logPath, `[${new Date().toISOString()}] ${msg}\n`);
  } catch (e) {}
}

logStep('Process started: ' + process.execPath);
logStep('Node version: ' + process.version);
logStep('argv: ' + JSON.stringify(process.argv));

process.on('uncaughtException', (err) => {
  logStep('UNCAUGHT EXCEPTION: ' + (err ? (err.stack || err.message || err) : 'unknown'));
});

process.on('unhandledRejection', (reason) => {
  logStep('UNHANDLED REJECTION: ' + (reason ? (reason.stack || reason.message || reason) : 'unknown'));
});

logStep('Loading configuration...');
const config = require('../shared/configuration');
logStep('Config loaded. BackendUrl: ' + config.backendUrl + ' BackendExe: ' + config.backendExe);

const { registerIpcHandlers } = require('./ipc/ipc-handlers');
logStep('Registering IPC handlers...');
registerIpcHandlers(config);

const { initializeApp } = require('./app-lifecycle');
logStep('Initializing app lifecycle...');
initializeApp(config);
logStep('initializeApp invoked.');
