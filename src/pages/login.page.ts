import { Page } from '@playwright/test';
import { logger } from '../config/logger';

interface LoginPageConfig {
  loginPageUrl: string;
  homeUrl: string;
  overduePromptUrl: string;
  overduePrompt?: {
    closeButtonSelectors?: string[];
    timeout?: number;
  };
}

export class LoginPage {
  constructor(
    private page: Page,
    private config: LoginPageConfig
  ) {}

  async navigateToLogin(): Promise<void> {
    logger.info('Navigating to login page');
    await this.page.goto(this.config.loginPageUrl);
  }

  async login(username: string, password: string): Promise<void> {
    logger.info(`Logging in as ${username}`);
    
    // Wait for username field to be ready
    const usernameField = this.page.locator('[id="oaloginform:userid"]');
    logger.info('Waiting for username field to be visible and enabled...');
    
    try {
      // Wait for field to be visible
      await usernameField.waitFor({ state: 'visible', timeout: 10000 });
      logger.info('Username field is visible');
      
      // Wait for field to be enabled
      await this.page.waitForFunction(() => {
        const field = document.querySelector('[id="oaloginform:userid"]') as HTMLInputElement;
        return field && !field.disabled && field.offsetParent !== null;
      }, { timeout: 10000 });
      logger.info('Username field is enabled and ready');
      
      // Clear field before filling to ensure clean state
      await usernameField.clear();
      logger.info('Username field cleared');
      
      // Fill username with slight delay between keystrokes
      await usernameField.fill(username);
      logger.info(`Username filled: ${username}`);
      
      // Verify username was filled correctly
      const filledUsername = await usernameField.inputValue();
      if (filledUsername !== username) {
        logger.warn(`Username field contains "${filledUsername}" instead of "${username}", retrying...`);
        await usernameField.clear();
        await this.page.waitForTimeout(200);
        await usernameField.fill(username);
      }
      logger.info('Username verified');
      
    } catch (error) {
      logger.error(`Failed to fill username field: ${error}`);
      throw new Error(`Username field not ready: ${error}`);
    }
    
    // Press Tab to move to password field
    try {
      await usernameField.press('Tab');
      logger.info('Tab pressed, moving to password field');
      await this.page.waitForTimeout(300);
    } catch (error) {
      logger.error(`Failed to press Tab: ${error}`);
    }
    
    // Wait for password field to be ready
    const passwordField = this.page.locator('[id="oaloginform:password"]');
    logger.info('Waiting for password field to be visible and enabled...');
    
    try {
      // Wait for field to be visible
      await passwordField.waitFor({ state: 'visible', timeout: 10000 });
      logger.info('Password field is visible');
      
      // Wait for field to be enabled
      await this.page.waitForFunction(() => {
        const field = document.querySelector('[id="oaloginform:password"]') as HTMLInputElement;
        return field && !field.disabled && field.offsetParent !== null;
      }, { timeout: 10000 });
      logger.info('Password field is enabled and ready');
      
      // Clear field before filling
      await passwordField.clear();
      logger.info('Password field cleared');
      
      // Fill password
      await passwordField.fill(password);
      logger.info('Password filled');
      
      // Verify password was filled correctly
      const filledPassword = await passwordField.inputValue();
      if (filledPassword !== password) {
        logger.warn('Password field not filled correctly, retrying...');
        await passwordField.clear();
        await this.page.waitForTimeout(200);
        await passwordField.fill(password);
      }
      logger.info('Password verified');
      
    } catch (error) {
      logger.error(`Failed to fill password field: ${error}`);
      throw new Error(`Password field not ready: ${error}`);
    }
    
    // Click Login button
    logger.info('Clicking Login button...');
    try {
      const loginButton = this.page.getByRole('button', { name: 'Login' });
      await loginButton.waitFor({ state: 'visible', timeout: 5000 });
      await loginButton.click();
      logger.info('Login button clicked');
    } catch (error) {
      logger.error(`Failed to click Login button: ${error}`);
      throw new Error(`Login button not found: ${error}`);
    }
    
    // OPTIONAL: Click "Yes, login" confirmation button (may not always appear)
    logger.info('Checking for confirmation dialog...');
    try {
      const confirmButton = this.page.getByRole('button', { name: 'Yes , login' });
      await confirmButton.waitFor({ state: 'visible', timeout: 10000 });
      await confirmButton.click();
      logger.info('Confirmation button clicked');
    } catch (error) {
      logger.info('No confirmation dialog found - this is normal if not required');
    }
    
    // Wait for navigation to complete
    logger.info('Waiting for page load...');
    await this.page.waitForLoadState('domcontentloaded').catch(error => {
      logger.warn(`Page load timeout: ${error}. Continuing anyway...`);
    });
    logger.info('Login process completed');
  }

  async isLoginSuccessful(username: string): Promise<boolean> {
    try {
      // Check if we're on the home/main page
      logger.info(`Verifying login success by checking URL: ${this.config.homeUrl}`);
      
      // Wait for the home page URL to be loaded
      await this.page.waitForURL(this.config.homeUrl, { timeout: 10000 });
      logger.info('Successfully navigated to home page');
      return true;
    } catch (error) {
      logger.error(`Login verification failed: ${error}`);
      logger.error(`Current URL: ${this.page.url()}`);
      return false;
    }
  }

  async completeHomePageLanding(username: string): Promise<void> {
    logger.info('Waiting for home page to finish loading');
    await this.page.waitForLoadState('domcontentloaded').catch(error => {
      logger.warn(`Home page load timeout: ${error}. Continuing anyway...`);
    });
    await this.page.waitForTimeout(3000);

    // Handle overdue prompt if present
    await this.handleOverduePrompt();

    await this.closePopupWindows();
    await this.switchToBusinessAdminView(username);
  }

  private async closePopupWindows(): Promise<void> {
    const popupPages = this.page.context().pages().filter(page => page !== this.page);

    for (const popupPage of popupPages) {
      logger.info(`Closing popup window: ${popupPage.url()}`);
      await popupPage.close();
    }
  }

  private async switchToBusinessAdminView(username: string): Promise<void> {
    logger.info('Switching to Business Admin View');

    const profileButton = this.page.getByText(username, { exact: true });
    await profileButton.click({ timeout: 5000 });

    const businessAdminView = this.page.getByText('Business Admin', { exact: true });
    await businessAdminView.click({ timeout: 5000 });

    const goButton = this.page.getByRole('button', { name: 'GO', exact: true });
    if (await goButton.isVisible({ timeout: 2000 }).catch(() => false)) {
      await goButton.click();
    }

    await this.page.waitForLoadState('domcontentloaded').catch(error => {
      logger.warn(`Business Admin view load timeout: ${error}. Continuing anyway...`);
    });
    logger.info('Waiting for Business Admin components to finish loading');
    await this.page.waitForTimeout(5000);
    logger.info('Business Admin View selected');
  }

  async handleOverduePrompt(): Promise<void> {
    logger.info('Checking for overdue prompt popup...');
    
    // Default close button selectors - try most specific first
    const defaultSelectors = [
      // Common button text patterns
      'button:has-text("Close")',
      'button:has-text("OK")',
      'button:has-text("Done")',
      'button:has-text("Proceed")',
      'button:has-text("Continue")',
      // CSS class patterns
      'button[type="button"]:has-text("Close")',
      '.close-button',
      '[aria-label="Close"]',
      'button.btn-close',
      'button[class*="close"]',
      'a[class*="close"]',
      // Generic button closing (last resort)
      '.modal-close',
      '.dialog-close',
      '[role="button"][aria-label*="close" i]',
      'span.close'
    ];
    
    const closeSelectors = this.config.overduePrompt?.closeButtonSelectors || defaultSelectors;
    const timeout = this.config.overduePrompt?.timeout || 5000;
    
    try {
      // Wait for the overdue prompt to appear (either by URL or by waiting a bit)
      logger.info('Waiting for overdue prompt...');
      let foundByUrl = false;
      try {
        await this.page.waitForURL(this.config.overduePromptUrl, { timeout: 2000 });
        logger.info('Overdue prompt URL detected');
        foundByUrl = true;
      } catch {
        logger.info('Overdue prompt URL not detected, checking if popup exists on current page');
      }
      
      // Small delay to ensure popup is rendered
      await this.page.waitForTimeout(1000);
      
      // Try multiple close button selectors
      let closed = false;
      for (const selector of closeSelectors) {
        try {
          logger.info(`Trying to close popup with selector: ${selector}`);
          const element = this.page.locator(selector).first();
          
          // Check if element is visible
          const isVisible = await element.isVisible({ timeout: 2000 }).catch(() => false);
          if (isVisible) {
            logger.info(`Found close button with selector: ${selector}, clicking it`);
            await element.click({ timeout: 3000 });
            await this.page.waitForTimeout(1000); // Wait for popup to close
            closed = true;
            logger.info('✓ Overdue prompt closed successfully');
            break;
          }
        } catch (error) {
          logger.debug(`Selector ${selector} failed: ${error}`);
          continue;
        }
      }
      
      if (!closed && foundByUrl) {
        logger.warn('Overdue prompt URL detected but close button not found - attempting to navigate away');
        // Try to go back or navigate to home
        try {
          await this.page.goto(this.config.homeUrl);
          await this.page.waitForLoadState('domcontentloaded').catch(() => {});
          logger.info('Navigated away from overdue prompt');
          closed = true;
        } catch (navError) {
          logger.warn(`Failed to navigate away: ${navError}`);
        }
      }
      
      if (!closed) {
        logger.info('No overdue prompt close button found, continuing without closing');
      }
      
    } catch (error) {
      logger.info(`No overdue prompt detected or already closed: ${error}`);
    }
  }

  async logout(username: string): Promise<void> {
    logger.info(`Logging out user: ${username}`);
    
    try {
      // Click on user profile/username
      await this.page.getByText(username).click({ timeout: 5000 });
      logger.info('User profile clicked');
      
      // Wait for dropdown menu to appear
      await this.page.waitForLoadState('networkidle');
      
      // Click logout button
      await this.page.locator('#logoutlnk2').getByText('Logout').click({ timeout: 5000 });
      logger.info('Logout clicked');
      
      // Wait for logout to complete
      await this.page.waitForLoadState('networkidle');
      logger.info('User logged out successfully');
    } catch (error) {
      logger.error(`Logout failed: ${error}`);
      throw error;
    }
  }
}