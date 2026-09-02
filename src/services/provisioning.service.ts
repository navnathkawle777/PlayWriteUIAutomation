import { chromium, Browser, Page } from '@playwright/test';
import { UserRecord, ExecutionResult } from '../data/models';
import { EnvironmentConfig } from '../config/config-loader';
import { LoginPage } from '../pages/login.page';
import { UserManagementPage } from '../pages/user-management.page';
import { AddUserPage } from '../pages/add-user.page';
import { AddUserToGroupPage } from '../pages/add-user-to-group.page';
import { AddUserToGroupRolePage } from '../pages/add-user-to-group-role';
import { EvidenceService } from './evidence.service';
import { logger } from '../config/logger';

export class ProvisioningService {
  private browser!: Browser;
  private page!: Page;
  private isAuthenticated = false;
  private evidenceService: EvidenceService;

  constructor(
    private config: EnvironmentConfig,
    private credentials: { username: string; password: string }
  ) {
    this.evidenceService = new EvidenceService(config.evidence.outputDir);
  }

  async initialize(): Promise<void> {
    logger.info('Initializing browser');

    this.browser = await chromium.launch({
      headless: this.config.execution.headless,
      slowMo: this.config.execution.slowMo
    });

    const context = await this.browser.newContext({
      viewport: { width: 1920, height: 1080 },
      ignoreHTTPSErrors: true,
      recordVideo: this.config.execution.captureVideo 
        ? { dir: `${this.config.evidence.outputDir}/videos` } 
        : undefined
    });

    this.page = await context.newPage();
    this.page.setDefaultTimeout(this.config.newgen.pageTimeout);

    // Setup network and console capture
    await this.evidenceService.setupNetworkCapture(this.page);

    if (this.config.execution.captureTrace) {
      await this.evidenceService.startTrace(this.page);
    }
  }

  async login(): Promise<void> {
    try {
      await this.page.goto(this.config.newgen.baseUrl);
      
      const loginPageConfig = {
        loginPageUrl: this.config.newgen.loginPageUrl,
        homeUrl: this.config.newgen.homeUrl,
        overduePromptUrl: this.config.newgen.overduePromptUrl,
        overduePrompt: this.config.newgen.overduePrompt
      };
      
      const loginPage = new LoginPage(this.page, loginPageConfig);
      await loginPage.login(this.credentials.username, this.credentials.password);

      if (!await loginPage.isLoginSuccessful(this.credentials.username)) {
        throw new Error('Login failed - verification checks did not pass');
      }

      await loginPage.completeHomePageLanding(this.credentials.username);
      const userManagementPage = new UserManagementPage(this.page);
      await userManagementPage.validateLoaded(this.config.newgen.UserUrl);
      this.isAuthenticated = true;
    } catch (error) {
      logger.error(`Login error: ${error}`);
      // Capture error evidence once
      try {
        await this.evidenceService.captureScreenshot(this.page, 'login', 'FAILED');
        await this.evidenceService.captureNetworkHar('login');
        await this.evidenceService.captureConsoleLogs('login');
      } catch (captureError) {
        logger.error(`Failed to capture error evidence: ${captureError}`);
      }
      throw error;
    }
  }

  async provisionUsers(users: UserRecord[]): Promise<ExecutionResult[]> {
    const results: ExecutionResult[] = [];

    for (const user of users) {
      const result = await this.provisionUser(user);
      results.push(result);

      if (!this.config.execution.continueOnError && result.status === 'FAILED') {
        logger.error('Stopping execution due to failure');
        break;
      }
    }

    return results;
  }

  private async provisionUser(user: UserRecord): Promise<ExecutionResult> {
    const startTime = new Date().toISOString();

    try {
      if (user.action === 'SKIP') {
        return {
          request_id: user.request_id,
          username: user.username,
          action: user.action,
          status: 'SKIPPED',
          message: 'Action set to SKIP',
          timestamp: startTime
        };
      }

      // Handle ADDUSERTOGROUP action
      if (user.action === 'ADDUSERTOGROUP') {
        return await this.addUserToGroup(user, startTime);
      }

      if (user.action === 'ADDUSERINGROUPROLE') {
        return await this.addUserInGroupRole(user, startTime);
      }

      const userMgmtPage = new UserManagementPage(this.page);
      
      // Check if user exists with retry logic
      logger.info(`Checking if user exists: ${user.username}`);
      let userExists = false;
      try {
        userExists = await userMgmtPage.searchUser(user.username);
      } catch (searchError) {
        logger.error(`User search failed: ${searchError}`);
        // On search error, treat as user doesn't exist and attempt creation
        userExists = false;
      }
      
      if (userExists) {
        logger.info(`User already exists: ${user.username} - Skipping creation`);
        
        if (this.config.execution.screenshotOnSuccess) {
          const screenshotPath = await this.evidenceService.captureScreenshot(
            this.page, 
            user.username, 
            'SKIPPED'
          );
          
          return {
            request_id: user.request_id,
            username: user.username,
            action: user.action,
            status: 'SKIPPED',
            message: 'User already exists',
            screenshot_path: screenshotPath,
            timestamp: startTime
          };
        }

        return {
          request_id: user.request_id,
          username: user.username,
          action: user.action,
          status: 'SKIPPED',
          message: 'User already exists',
          timestamp: startTime
        };
      }

      // User does not exist, proceed to create
      logger.info(`User does not exist: ${user.username} - Proceeding to Add User`);
      
      // Navigate to Add User
      let addUserPageContext: Page;
      try {
        addUserPageContext = await userMgmtPage.navigateToAddUser();
      } catch (navError) {
        throw new Error(`Failed to navigate to Add User page: ${navError}`);
      }

      // Create user with UserManagementPage reference for verification and screenshot callback
      const addUserPage = new AddUserPage(
        addUserPageContext, 
        userMgmtPage,
        (page, username, status) => this.evidenceService.captureScreenshot(page, username, status)
      );
      await addUserPage.createUser(user);

      // Capture evidence
      let screenshotPath: string | undefined;
      let tracePath: string | undefined;

      if (this.config.execution.screenshotOnSuccess) {
        screenshotPath = await this.evidenceService.captureScreenshot(
          this.page, 
          user.username, 
          'SUCCESS'
        );
      }

      if (this.config.execution.captureTrace) {
        tracePath = await this.evidenceService.stopTrace(this.page, user.username);
        await this.evidenceService.startTrace(this.page);
      }

      return {
        request_id: user.request_id,
        username: user.username,
        action: user.action,
        status: 'SUCCESS',
        message: 'User created successfully',
        screenshot_path: screenshotPath,
        trace_path: tracePath,
        timestamp: startTime
      };
    } catch (error) {
      logger.error(`Failed to provision user ${user.username}: ${error}`);

      let screenshotPath: string | undefined;
      let networkPath: string | undefined;
      let consolePath: string | undefined;

      try {
        if (this.config.execution.screenshotOnFailure) {
          screenshotPath = await this.evidenceService.captureScreenshot(
            this.page,
            user.username,
            'FAILED'
          );
        }

        // Capture network requests for failed operations
        networkPath = await this.evidenceService.captureNetworkHar(user.username);
        consolePath = await this.evidenceService.captureConsoleLogs(user.username);
      } catch (captureError) {
        logger.error(`Failed to capture error evidence: ${captureError}`);
      }

      return {
        request_id: user.request_id,
        username: user.username,
        action: user.action,
        status: 'FAILED',
        message: error instanceof Error ? error.message : String(error),
        screenshot_path: screenshotPath,
        trace_path: networkPath,
        video_path: consolePath,
        timestamp: startTime
      };
    }
  }

  /**
   * Handle ADDUSERTOGROUP action
   * Steps:
   * 1. Search for user in User Management
   * 2. If found, select user checkbox
   * 3. Open edit user dialog
   * 4. Add user to groups
   * 5. Close dialog and return success
   */
  private async addUserToGroup(user: UserRecord, startTime: string): Promise<ExecutionResult> {
    try {
      logger.info(`Starting ADDUSERTOGROUP workflow for user: ${user.username}`);

      // Validate required fields
      if (!user.groups) {
        return {
          request_id: user.request_id,
          username: user.username,
          action: user.action,
          status: 'FAILED',
          message: 'Groups field is required for ADDUSERTOGROUP action',
          timestamp: startTime
        };
      }

      const userMgmtPage = new UserManagementPage(this.page);

      // Step 1: Search for user
      logger.info(`Step 1: Searching for user: ${user.username}`);
      const userFound = await userMgmtPage.searchUser(user.username);
      
      if (!userFound) {
        logger.error(`User not found: ${user.username}`);
        
        return {
          request_id: user.request_id,
          username: user.username,
          action: user.action,
          status: 'FAILED',
          message: `User "${user.username}" not found in system`,
          timestamp: startTime
        };
      }

      logger.info(`User found: ${user.username}`);

      // Step 2: Select user checkbox
      logger.info(`Step 2: Selecting user checkbox`);
      const checkboxSelected = await userMgmtPage.selectUserCheckbox();
      
      if (!checkboxSelected) {
        throw new Error('Failed to select user checkbox');
      }

      // Step 3: Open edit user dialog
      logger.info(`Step 3: Opening edit user dialog`);
      const editUserPopup = await userMgmtPage.openEditUserDialog();

      // Wait for UI to fully load
      await editUserPopup.waitForLoadState('networkidle');
      await editUserPopup.waitForTimeout(1000); // Additional buffer if needed

      // Step 4: Add user to groups
      logger.info(`Step 4: Adding user to groups: ${user.groups}`);
      const addUserToGroupPage = new AddUserToGroupPage(editUserPopup);
      const groupsAdded = await addUserToGroupPage.addUserToGroups(user.groups);

      if (!groupsAdded) {
        throw new Error('Failed to add user to groups');
      }

      // Step 5: Close dialog
      logger.info(`Step 5: Closing edit user dialog`);
      await addUserToGroupPage.closePopup();
      await this.page.waitForTimeout(1000);

      // Capture success screenshot
      let screenshotPath: string | undefined;
      if (this.config.execution.screenshotOnSuccess) {
        screenshotPath = await this.evidenceService.captureScreenshot(
          this.page,
          user.username,
          'GROUPADDED'
        );
      }

      logger.info(`Successfully added user to groups: ${user.username}`);
      
      return {
        request_id: user.request_id,
        username: user.username,
        action: user.action,
        status: 'SUCCESS',
        message: `User successfully added to groups: ${user.groups}`,
        screenshot_path: screenshotPath,
        timestamp: startTime
      };
    } catch (error) {
      logger.error(`Failed to add user to groups ${user.username}: ${error}`);

      let screenshotPath: string | undefined;
      let networkPath: string | undefined;
      let consolePath: string | undefined;

      try {
        if (this.config.execution.screenshotOnFailure) {
          screenshotPath = await this.evidenceService.captureScreenshot(
            this.page,
            user.username,
            'FAILED'
          );
        }

        networkPath = await this.evidenceService.captureNetworkHar(user.username);
        consolePath = await this.evidenceService.captureConsoleLogs(user.username);
      } catch (captureError) {
        logger.error(`Failed to capture error evidence: ${captureError}`);
      }

      return {
        request_id: user.request_id,
        username: user.username,
        action: user.action,
        status: 'FAILED',
        message: error instanceof Error ? error.message : String(error),
        screenshot_path: screenshotPath,
        trace_path: networkPath,
        video_path: consolePath,
        timestamp: startTime
      };
    }
  }

  private async addUserInGroupRole(user: UserRecord, startTime: string): Promise<ExecutionResult> {
    try {
      if (!user.roles) {
        throw new Error('Roles field is required for ADDUSERINGROUPROLE action');
      }

      logger.info(`Starting ADDUSERINGROUPROLE workflow for user: ${user.username}`);
      const groupRolePage = new AddUserToGroupRolePage(this.page);
      const rolesAdded = await groupRolePage.addUserToGroupRoles(user.username, user.roles);
      if (!rolesAdded) {
        throw new Error('Failed to add user roles to groups');
      }

      return {
        request_id: user.request_id,
        username: user.username,
        action: user.action,
        status: 'SUCCESS',
        message: `User successfully assigned group roles: ${user.roles}`,
        timestamp: startTime
      };
    } catch (error) {
      logger.error(`Failed to add group roles for ${user.username}: ${error}`);
      return {
        request_id: user.request_id,
        username: user.username,
        action: user.action,
        status: 'FAILED',
        message: error instanceof Error ? error.message : String(error),
        timestamp: startTime
      };
    }
  }

  async close(): Promise<void> {
    try {
      if (this.page && this.isAuthenticated) {
        logger.info('Starting logout process');
        try {
          const loginPageConfig = {
            loginPageUrl: this.config.newgen.loginPageUrl,
            homeUrl: this.config.newgen.homeUrl,
            overduePromptUrl: this.config.newgen.overduePromptUrl,
            overduePrompt: this.config.newgen.overduePrompt
          };
          const loginPage = new LoginPage(this.page, loginPageConfig);
          await loginPage.logout(this.credentials.username);
          logger.info('Logout completed');
        } catch (logoutError) {
          logger.warn(`Logout failed, continuing with browser close: ${logoutError}`);
        }
      } else if (this.page) {
        logger.info('Skipping logout because login was not completed successfully');
      }

      if (this.browser) {
        logger.info('Closing browser');
        await this.browser.close();
        logger.info('Browser closed successfully');
      }
    } catch (error) {
      logger.error(`Error closing browser: ${error}`);
      // Continue anyway, don't throw
    }
  }
}