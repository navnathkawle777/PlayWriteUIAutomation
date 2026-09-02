import { Page, BrowserContext } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import { logger } from '../config/logger';

export interface NetworkRequest {
  url: string;
  method: string;
  status?: number;
  statusText?: string;
  responseTime: number;
  error?: string;
}

export class EvidenceService {
  private screenshotDir: string;
  private traceDir: string;
  private videoDir: string;
  private networkDir: string;
  private consoleDir: string;
  private networkRequests: NetworkRequest[] = [];
  private consoleLogs: any[] = [];

  constructor(outputDir: string) {
    this.screenshotDir = path.join(outputDir, 'screenshots');
    this.traceDir = path.join(outputDir, 'traces');
    this.videoDir = path.join(outputDir, 'videos');
    this.networkDir = path.join(outputDir, 'network');
    this.consoleDir = path.join(outputDir, 'console');

    this.ensureDirectories();
  }

  private ensureDirectories(): void {
    [this.screenshotDir, this.traceDir, this.videoDir, this.networkDir, this.consoleDir].forEach(dir => {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    });
  }

  async setupNetworkCapture(page: Page): Promise<void> {
    this.networkRequests = [];
    this.consoleLogs = [];

    // Capture network requests
    page.on('request', request => {
      logger.debug(`Network Request: ${request.method()} ${request.url()}`);
    });

    page.on('response', response => {
      const startTime = Date.now();
      response.finished().then(() => {
        const responseTime = Date.now() - startTime;
        this.networkRequests.push({
          url: response.url(),
          method: response.request().method(),
          status: response.status(),
          statusText: response.statusText(),
          responseTime
        });

        if (response.status() >= 400) {
          logger.error(`Failed Request: ${response.status()} ${response.url()}`);
        }
      }).catch(err => {
        this.networkRequests.push({
          url: response.url(),
          method: response.request().method(),
          status: response.status(),
          statusText: response.statusText(),
          responseTime: 0,
          error: err.message
        });
      });
    });

    // Capture console messages
    page.on('console', msg => {
      const logEntry = {
        type: msg.type(),
        text: msg.text(),
        timestamp: new Date().toISOString()
      };
      this.consoleLogs.push(logEntry);
      
      if (msg.type() === 'error') {
        logger.error(`Console Error: ${msg.text()}`);
      }
    });

    // Capture page errors
    page.on('pageerror', error => {
      logger.error(`Page Error: ${error.message}`);
      this.consoleLogs.push({
        type: 'error',
        text: error.message,
        stack: error.stack,
        timestamp: new Date().toISOString()
      });
    });
  }

  async captureScreenshot(page: Page, username: string, status: string): Promise<string> {
    const timestamp = new Date().toISOString().replace(/:/g, '-').split('.')[0];
    const filename = `${username}_${status}_${timestamp}.png`;
    const filepath = path.join(this.screenshotDir, filename);

    try {
      await page.screenshot({ path: filepath, fullPage: true });
      logger.info(`Screenshot captured: ${filepath}`);
    } catch (error) {
      logger.error(`Failed to capture screenshot: ${error}`);
    }

    return filepath;
  }

  async captureNetworkHar(username: string): Promise<string> {
    const timestamp = new Date().toISOString().replace(/:/g, '-').split('.')[0];
    const filename = `${username}_network_${timestamp}.json`;
    const filepath = path.join(this.networkDir, filename);

    const harData = {
      log: {
        version: '1.2.0',
        creator: { name: 'Evidence Service', version: '1.0' },
        entries: this.networkRequests.map(req => ({
          request: {
            method: req.method,
            url: req.url,
            httpVersion: 'HTTP/1.1'
          },
          response: {
            status: req.status,
            statusText: req.statusText,
            httpVersion: 'HTTP/1.1',
            headers: [],
            content: { size: 0, mimeType: 'application/json' }
          },
          time: req.responseTime,
          cache: {},
          timings: { wait: req.responseTime, receive: 0, send: 0 }
        }))
      }
    };

    fs.writeFileSync(filepath, JSON.stringify(harData, null, 2));
    logger.info(`Network HAR captured: ${filepath}`);

    return filepath;
  }

  async captureConsoleLogs(username: string): Promise<string> {
    const timestamp = new Date().toISOString().replace(/:/g, '-').split('.')[0];
    const filename = `${username}_console_${timestamp}.json`;
    const filepath = path.join(this.consoleDir, filename);

    fs.writeFileSync(filepath, JSON.stringify(this.consoleLogs, null, 2));
    logger.info(`Console logs captured: ${filepath}`);

    return filepath;
  }

  async startTrace(page: Page): Promise<void> {
    await page.context().tracing.start({ screenshots: true, snapshots: true });
  }

  async stopTrace(page: Page, username: string): Promise<string> {
    const timestamp = new Date().toISOString().replace(/:/g, '-').split('.')[0];
    const filename = `${username}_${timestamp}.zip`;
    const filepath = path.join(this.traceDir, filename);

    await page.context().tracing.stop({ path: filepath });
    logger.info(`Trace captured: ${filepath}`);

    return filepath;
  }
}