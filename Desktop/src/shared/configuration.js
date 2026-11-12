// ═══════════════════════════════════════════════════════════
// HENU ERP — Desktop Host Configuration
// ═══════════════════════════════════════════════════════════
// Dynamic configuration helper for host endpoints & options
// ═══════════════════════════════════════════════════════════

const path = require('path');
const fs = require('fs');
const constants = require('./constants');
let electronApp = null;
try {
  electronApp = require('electron').app;
} catch (e) {}

class DesktopConfig {
  constructor() {
    this.port = parseInt(process.env.JEEVIKA_BACKEND_PORT || constants.DEFAULT_PORT, 10);
    this.host = process.env.JEEVIKA_BACKEND_HOST || constants.DEFAULT_HOST;
    this.isDevelopment = process.argv.includes('--dev') || process.env.NODE_ENV === 'development';

    const hasPackagedBackend = process.resourcesPath && fs.existsSync(path.join(process.resourcesPath, 'backend', 'JeevikaERP.exe'));
    const isPackaged = (electronApp && electronApp.isPackaged) ||
                       __dirname.includes('app.asar') ||
                       hasPackagedBackend;

    if (isPackaged) {
      const resourcesDir = process.resourcesPath;
      this.rootDir = path.join(resourcesDir, 'webapp');
      this.backendDir = path.join(resourcesDir, 'backend');
      this.backendExe = path.join(this.backendDir, 'JeevikaERP.exe');
      this.backendDll = path.join(this.backendDir, 'JeevikaERP.dll');
      this.appIconPath = path.join(this.rootDir, 'icon.ico');
      if (!fs.existsSync(this.appIconPath)) {
        this.appIconPath = path.join(__dirname, '..', '..', 'icon.ico');
      }
    } else {
      this.rootDir = path.resolve(__dirname, '..', '..', '..');
      this.backendDir = path.join(this.rootDir, 'Backend');
      const scExe = path.join(this.backendDir, 'publish_selfcontained', 'JeevikaERP.exe');
      this.backendExe = fs.existsSync(scExe) ? scExe : path.join(this.backendDir, 'bin', 'Debug', 'net8.0', 'JeevikaERP.exe');
      this.backendDll = path.join(this.backendDir, 'bin', 'Debug', 'net8.0', 'JeevikaERP.dll');
      this.appIconPath = path.join(__dirname, '..', '..', 'icon.ico');
    }
  }

  get backendUrl() {
    return `http://${this.host}:${this.port}`;
  }

  get appEntryUrl() {
    return `${this.backendUrl}${constants.APP_ENTRY_PATH}`;
  }

  get healthCheckUrl() {
    return `${this.backendUrl}${constants.HEALTH_CHECK_PATH}`;
  }

  get fallbackCheckUrl() {
    return `${this.backendUrl}${constants.FALLBACK_CHECK_PATH}`;
  }

  get preloadScriptPath() {
    return path.join(__dirname, '..', 'preload', 'preload.js');
  }
}

module.exports = new DesktopConfig();
