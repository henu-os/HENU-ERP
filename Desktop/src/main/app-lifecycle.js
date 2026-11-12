// ═══════════════════════════════════════════════════════════
// JEEVIKA ERP 2.0 — Application Lifecycle Orchestrator
// ═══════════════════════════════════════════════════════════
// Coordinates Electron initialization, readiness probes,
// backend process management, and clean application exit.
// ═══════════════════════════════════════════════════════════

const { app } = require('electron');
const fs = require('fs');
const path = require('path');
const os = require('os');
const windowManager = require('./window-manager');
const backendManager = require('./backend-manager');
const readinessCheck = require('./readiness-check');

const logDir = path.join(process.env.APPDATA || os.tmpdir(), 'HENU ERP');
try { if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true }); } catch (e) {}
const logPath = path.join(logDir, 'startup.log');
function logStep(msg) {
  try {
    fs.appendFileSync(logPath, `[${new Date().toISOString()}] [Lifecycle] ${msg}\n`);
  } catch (e) {}
}

/**
 * Initializes and runs the complete application lifecycle
 * @param {import('../shared/configuration')} config
 */
function initializeApp(config) {
  logStep('Registering app.whenReady listener');
  app.whenReady().then(async () => {
    logStep('app.whenReady triggered! Creating main window...');
    const mainWindow = windowManager.createMainWindow(config);
    logStep('MainWindow created.');

    logStep(`Checking initial backend health on ${config.backendUrl}...`);
    let isHealthy = await readinessCheck.checkBackendHealth(config);
    logStep(`Initial backend health: ${isHealthy}`);

    if (!isHealthy) {
      logStep('Backend is offline. Starting managed local backend process...');
      const started = backendManager.startManagedBackend(config);
      logStep(`startManagedBackend returned: ${started}`);

      if (started) {
        logStep('Polling backend readiness probe...');
        const readiness = await readinessCheck.waitForBackendReady(config, (attempt, max) => {
          logStep(`Probing backend readiness (attempt ${attempt}/${max})...`);
        });

        isHealthy = readiness.ready;
        logStep(`Readiness probe result: isHealthy=${isHealthy}`);
        if (!isHealthy) {
          logStep(`Readiness check failed: ${readiness.error}`);
          windowManager.loadErrorScreen(mainWindow, readiness.error || 'Readiness timeout', config.appEntryUrl);
          return;
        }
      } else {
        logStep('Failed to start backend process.');
        windowManager.loadErrorScreen(mainWindow, 'Could not launch ASP.NET Core process', config.appEntryUrl);
        return;
      }
    } else {
      logStep('Connected to existing active backend process.');
    }

    if (isHealthy) {
      logStep(`Backend ready. Loading application entry: ${config.appEntryUrl}`);
      windowManager.loadApplicationUrl(mainWindow, config.appEntryUrl).catch((err) => {
        logStep(`Failed to load application URL: ${err.message}`);
        windowManager.loadErrorScreen(mainWindow, err.message, config.appEntryUrl);
      });
    }

    app.on('activate', () => {
      if (windowManager.getMainWindow() === null) {
        windowManager.createMainWindow(config);
      }
    });
  });

  // Teardown hooks
  app.on('window-all-closed', () => {
    console.log('[Lifecycle] All windows closed. Initiating teardown...');
    backendManager.stopManagedBackend();
    if (process.platform !== 'darwin') {
      app.quit();
    }
  });

  app.on('before-quit', () => {
    console.log('[Lifecycle] Application quitting. Stopping managed backend...');
    backendManager.stopManagedBackend();
  });

  app.on('will-quit', () => {
    backendManager.stopManagedBackend();
  });
}

module.exports = {
  initializeApp
};
