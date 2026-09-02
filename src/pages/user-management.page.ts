import { Page } from '@playwright/test';
import { logger } from '../config/logger';

export class UserManagementPage {
  constructor(private readonly page: Page) {}

  async validateLoaded(profileManagementUrl: string): Promise<void> {
    logger.info('Validating User Management API response');

    let responseStatus = await this.checkProfileManagementApi(profileManagementUrl);
    logger.info(`User Management API response status: ${responseStatus}`);

    if (responseStatus !== 200) {
      logger.warn(`User Management API returned ${responseStatus}, refreshing profile management`);

      const refreshResponse = this.page.waitForResponse(
        response => response.url().split('?')[0] === profileManagementUrl,
        { timeout: 10000 }
      );
      const refreshButton = this.page
        .locator('iframe[name="iframe_Int34"]')
        .contentFrame()
        .getByTitle('Refresh');
      await refreshButton.click();
      try {
        responseStatus = (await refreshResponse).status();
      } catch (error) {
        logger.warn(`User Management refresh response was not received: ${error}`);
        responseStatus = 0;
      }
      logger.info(`User Management API retry response status: ${responseStatus}`);
    }

    if (responseStatus !== 200) {
      throw new Error(`User Management API did not load successfully: HTTP ${responseStatus}`);
    }

    logger.info('User Management loaded successfully');
  }

  private async checkProfileManagementApi(profileManagementUrl: string): Promise<number> {
    try {
      const response = await this.page.context().request.get(profileManagementUrl, {
        timeout: 10000,
        failOnStatusCode: false
      });
      return response.status();
    } catch (error) {
      logger.warn(`User Management API request failed: ${error}`);
      return 0;
    }
  }

  async navigateToAddUser(): Promise<Page> {
    logger.info('Navigating to Add User');

    const frame = this.page.locator('iframe[name="iframe_Int34"]').contentFrame();
    if (!frame) {
      throw new Error('User Management iframe was not found');
    }

    const popupPromise = this.page.waitForEvent('popup');
    await frame.locator('[id="profilemgmt:addEnable"]').click();
    const addUserPage = await popupPromise;

    await addUserPage.waitForLoadState('domcontentloaded');
    logger.info('Add User popup opened');

    return addUserPage;
  }

  async searchUser(username: string): Promise<boolean> {
    logger.info(`Searching for user: ${username}`);

    const frame = this.page.locator('iframe[name="iframe_Int34"]').contentFrame();
    if (!frame) {
      throw new Error('User Management iframe was not found');
    }

    // Retry logic for robustness
    const maxRetries = 3;
    let attempt = 0;
    let lastError: string = '';

    while (attempt < maxRetries) {
      try {
        attempt++;
        logger.info(`Search attempt ${attempt}/${maxRetries} for user: ${username}`);

        // Click User tab to ensure we're on the right tab
        try {
          await frame.getByText('User', { exact: true }).click();
          await this.page.waitForTimeout(500);
        } catch {
          logger.warn('User tab was not clickable; continuing with direct search');
        }

        // Clear and fill search field
        const searchInput = frame.locator('[id="profilemgmt:Prefix"]');
        await searchInput.waitFor({ state: 'visible', timeout: 10000 });
        await searchInput.clear();
        await this.page.waitForTimeout(300);
        
        await searchInput.fill(username);
        logger.info(`Search field filled with: ${username}`);
        await this.page.waitForTimeout(300);
        
        // Press Enter to search
        await searchInput.press('Enter');
        logger.info('Search submitted');
        await this.page.waitForTimeout(800);

        // Check for "No Users Found" message
        const noUsersFound = frame.getByText('No Users Found');
        const noUsersVisible = await noUsersFound.isVisible({ timeout: 3000 }).catch(() => false);
        
        if (noUsersVisible) {
          logger.info(`User not found: ${username}`);
          return false;
        }

        // Search for the user in the results
        const sanitizedUsername = username.replace(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`);
        const userRow = frame.locator('div, tr, td, li').filter({
          hasText: new RegExp(String.raw`^\s*${sanitizedUsername}\b`, 'i')
        }).first();

        const userExists = await userRow.isVisible({ timeout: 5000 }).catch(() => false);
        
        if (userExists) {
          logger.info(`User found in list: ${username}`);
          await userRow.click();
          return true;
        }

        logger.warn(`User not found in list: ${username} - attempt ${attempt}/${maxRetries}`);
        
        // If this is not the last attempt, wait and retry
        if (attempt < maxRetries) {
          logger.info(`Retrying search for ${username}...`);
          await this.page.waitForTimeout(1000);
        }
        
      } catch (error) {
        lastError = String(error);
        logger.warn(`Search attempt ${attempt} failed: ${lastError}`);
        
        if (attempt < maxRetries) {
          logger.info(`Retrying search for ${username}...`);
          await this.page.waitForTimeout(1000);
        }
      }
    }

    logger.warn(`User search failed after ${maxRetries} attempts: ${username} - ${lastError}`);
    return false;
  }

  /**
   * Check the checkbox for the first user in the search results
   */
  async selectUserCheckbox(): Promise<boolean> {
    try {
      logger.info('Selecting user checkbox');

      const frame = this.page.locator('iframe[name="iframe_Int34"]').contentFrame();
      if (!frame) {
        throw new Error('User Management iframe was not found');
      }

      // Find the first user checkbox in the results
      const checkbox = frame.locator('[id*="profilemgmt:userlist"][id*="chkUser"]').first();
      const isVisible = await checkbox.isVisible({ timeout: 3000 }).catch(() => false);
      
      if (!isVisible) {
        logger.warn('User checkbox not found');
        return false;
      }

      await checkbox.check();
      logger.info('User checkbox selected');
      return true;
    } catch (error) {
      logger.error(`Failed to select user checkbox: ${error}`);
      return false;
    }
  }

  /**
   * Open the edit user dialog
   * Returns the popup page for further interaction
   */
  async openEditUserDialog(): Promise<Page> {
    try {
      logger.info('Opening edit user dialog');

      const frame = this.page.locator('iframe[name="iframe_Int34"]').contentFrame();
      if (!frame) {
        throw new Error('User Management iframe was not found');
      }

      // Wait for popup and click the edit button
      const popupPromise = this.page.waitForEvent('popup');
      const editButton = frame.locator('[id="profilemgmt:cmdmodifyenableU1"]');
      const isVisible = await editButton.isVisible({ timeout: 3000 }).catch(() => false);
      
      if (!isVisible) {
        throw new Error('Edit button not found');
      }

      await editButton.click();
      logger.info('Edit button clicked, waiting for popup');
      
      const editUserPopup = await popupPromise;
      await editUserPopup.waitForLoadState('domcontentloaded');
      logger.info('Edit user popup opened successfully');
      
      return editUserPopup;
    } catch (error) {
      logger.error(`Failed to open edit user dialog: ${error}`);
      throw error;
    }
  }
}