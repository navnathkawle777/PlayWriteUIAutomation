import { chromium } from '@playwright/test';
import { ConfigLoader } from './config/config-loader';
import { ExcelReader } from './data/excel-reader';
import { UserRecord, ExecutionResult } from './data/models';
import { LoginPage } from './pages/login.page';
import { SaveUserPreferenceLayoutPage } from './pages/save-user-preference-layout.page';
import { EvidenceService } from './services/evidence.service';
import { logger } from './config/logger';

interface CliOptions {
  env: string;
}

function parseArgs(args: string[]): CliOptions {
  const envIndex = args.indexOf('--env');
  const env = envIndex >= 0 && args[envIndex + 1] ? args[envIndex + 1] : 'uat';
  return { env };
}

async function saveLayoutForUser(
  config: ReturnType<typeof ConfigLoader.loadEnvironmentConfig>,
  user: UserRecord,
  evidenceService: EvidenceService
): Promise<ExecutionResult> {
  const timestamp = new Date().toISOString();
  const browser = await chromium.launch({
    headless: config.execution.headless,
    slowMo: config.execution.slowMo
  });

  try {
    const context = await browser.newContext({
      viewport: { width: 1920, height: 1080 },
      ignoreHTTPSErrors: true
    });
    const page = await context.newPage();
    page.setDefaultTimeout(config.newgen.pageTimeout);

    await page.goto(config.newgen.baseUrl);

    const loginPage = new LoginPage(page, {
      loginPageUrl: config.newgen.loginPageUrl,
      homeUrl: config.newgen.homeUrl,
      overduePromptUrl: config.newgen.overduePromptUrl,
      overduePrompt: config.newgen.overduePrompt
    });

    await loginPage.login(user.username, user.password!);

    if (!(await loginPage.isLoginSuccessful(user.username))) {
      throw new Error('Login failed - verification checks did not pass');
    }

    await loginPage.handleOverduePrompt();

    const saveLayoutPage = new SaveUserPreferenceLayoutPage(page);
    const selectedView = await saveLayoutPage.saveLayout(user.username);

    const screenshotPath = await evidenceService.captureScreenshot(page, user.username, 'SUCCESS');

    logger.info(`Layout saved successfully for user "${user.username}" using "${selectedView}" view`);

    try {
      await loginPage.logout(user.username);
    } catch (logoutError) {
      logger.warn(`Logout failed for user "${user.username}", continuing: ${logoutError}`);
    }

    return {
      request_id: user.request_id,
      username: user.username,
      action: 'SAVELAYOUT',
      status: 'SUCCESS',
      message: `Layout saved successfully using "${selectedView}" view`,
      screenshot_path: screenshotPath,
      timestamp
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error(`Failed to save layout for user "${user.username}": ${message}`);

    return {
      request_id: user.request_id,
      username: user.username,
      action: 'SAVELAYOUT',
      status: 'FAILED',
      message,
      timestamp
    };
  } finally {
    await browser.close();
  }
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const config = ConfigLoader.loadEnvironmentConfig(options.env);
  const inputPath = './input/users.xlsx';
  const users = ExcelReader.readUsers(inputPath);
  const evidenceService = new EvidenceService(config.evidence.outputDir);

  const usersWithCredentials = users.filter(user => {
    if (user.action !== 'SAVELAYOUT') {
      return false;
    }
    if (!user.username || !user.password) {
      logger.warn(`Skipping request_id "${user.request_id}" - missing username or password`);
      return false;
    }
    if (user.status === 'SUCCESS') {
      logger.info(`Skipping "${user.username}" - layout already saved (status=SUCCESS)`);
      return false;
    }
    return true;
  });

  if (usersWithCredentials.length === 0) {
    logger.info('No SAVELAYOUT users left to process - nothing to do');
    return;
  }

  const results: ExecutionResult[] = [];
  for (const user of usersWithCredentials) {
    logger.info(`Processing layout save for user "${user.username}"`);
    const result = await saveLayoutForUser(config, user, evidenceService);
    results.push(result);
  }

  ExcelReader.updateResults(inputPath, results);
}

if (require.main === module) {
  main()
    .catch((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      logger.error(`Fatal error: ${message}`);
      process.exitCode = 1;
    })
    .finally(() => {
      // Force exit after 10 seconds to prevent hanging
      setTimeout(() => {
        logger.warn('Process did not exit gracefully, forcing exit');
        process.exit(process.exitCode || 0);
      }, 10000).unref();
    });
}
