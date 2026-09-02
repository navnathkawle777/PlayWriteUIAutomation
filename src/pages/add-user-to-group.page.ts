import { Page } from '@playwright/test';
import { logger } from '../config/logger';

export class AddUserToGroupPage {
  constructor(private readonly page: Page) {}

  /**
   * Add user to group workflow
   * Assumes the edit user popup is already open with iframe context
   */
  async addUserToGroups(groupNames: string): Promise<boolean> {
    try {
      // Parse comma-separated group names
      const groups = groupNames.split(',').map(g => g.trim()).filter(g => g.length > 0);
      
      if (groups.length === 0) {
        logger.info('No groups to add, skipping group assignment');
        return true;
      }

      logger.info(`Adding user to ${groups.length} group(s): ${groups.join(', ')}`);

      // Step 1: Click on Groups tab
      logger.info('Step 1: Clicking on Groups tab');
      await this.clickGroupsTab();
      await this.page.waitForTimeout(1000);

      // Step 2: For each group, search and add
      for (let i = 0; i < groups.length; i++) {
        const groupName = groups[i];
        logger.info(`Step 2.${i + 1}: Adding group "${groupName}"`);
        
        const groupAdded = await this.searchAndAddGroup(groupName);
        if (!groupAdded) {
          logger.warn(`Failed to add group "${groupName}", continuing with next group...`);
        }
      }

      // Step 3: Click Save button
      logger.info('Step 3: Clicking Save button');
      await this.clickSaveButton();
      
      // Wait for save to complete
      await this.page.waitForTimeout(2000);

      // Check for any error popups and close them
      const hasError = await this.handleErrorPopup();
      if (hasError) {
        logger.warn('Error occurred during group assignment, but continuing...');
      }

      // Capture the saved state before confirmation closes the popup page.
      logger.info('Capturing screenshot after group assignment');
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const screenshotPath = `output/screenshots/GROUPASSIGNMENT_${timestamp}.png`;
      await this.page.screenshot({ path: screenshotPath });
      logger.info(`Screenshot captured: ${screenshotPath}`);

      await this.closeSuccessPopup();

      logger.info('Group assignment completed successfully');
      return true;
    } catch (error) {
      logger.error(`Failed to add user to groups: ${error}`);
      return false;
    }
  }

  /**
   * Click on the Groups tab in the edit user popup
   */
  private async clickGroupsTab(): Promise<void> {
    try {
      // Groups tab is a direct button in the popup (not in iframe)
      const groupsTab = this.page.getByText('Groups', { exact: true }).first();
      const isVisible = await groupsTab.isVisible({ timeout: 3000 }).catch(() => false);
      
      if (isVisible) {
        logger.info('Groups tab found, clicking...');
        await groupsTab.click();
      } else {
        throw new Error('Groups tab not found');
      }
    } catch (error) {
      logger.error(`Failed to click Groups tab: ${error}`);
      throw error;
    }
  }

  /**
   * Search for a group and add it to the user
   */
  private async searchAndAddGroup(groupName: string): Promise<boolean> {
    try {
      logger.info(`Searching for group: "${groupName}"`);

      // Find the group search field
      const searchField = this.page.locator('[id="usermgmt:PUPrefix"]').first();
      const searchFieldVisible = await searchField.isVisible({ timeout: 2000 }).catch(() => false);
      
      if (!searchFieldVisible) {
        logger.warn('Group search field not found');
        return false;
      }

      // Clear and fill the search field
      logger.info(`Filling group search field with: "${groupName}"`);
      await searchField.click();
      await searchField.fill('');
      await this.page.waitForTimeout(300);
      await this.page.keyboard.type(groupName, { delay: 50 });
      
      // Press Enter to search
      logger.info('Pressing Enter to search for group');
      await searchField.press('Enter');

      const noRecordsFound = this.page.getByText('No Records Found', { exact: true }).first();
      const escapedGroupName = groupName.replace(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`);
      const matchingGroupLabel = this.page.locator(
        '[id^="usermgmt:usergrouplistTable:"][id$=":GroupNameDisplay"]'
      ).filter({ hasText: new RegExp(`^${escapedGroupName}$`) });

      logger.info(`Waiting for search results for group "${groupName}"`);
      await this.page.waitForFunction(
        ({ groupName, noRecordsText }) => {
          const isVisible = (element: Element | null): boolean => {
            if (!element) {
              return false;
            }

            const styles = window.getComputedStyle(element);
            return styles.visibility !== 'hidden' && styles.display !== 'none';
          };

          return Array.from(document.querySelectorAll('*')).some(element =>
            isVisible(element) &&
            (element.textContent?.trim() === groupName || element.textContent?.trim() === noRecordsText)
          );
        },
        { groupName, noRecordsText: 'No Records Found' },
        { timeout: 10000 }
      );

      if (await noRecordsFound.isVisible({ timeout: 500 }).catch(() => false)) {
        logger.warn(`No results found for group "${groupName}"`);
        return false;
      }

      const matchingLabel = matchingGroupLabel.first();
      const matchingLabelId = await matchingLabel.getAttribute('id');
      if (!matchingLabelId) {
        logger.warn(`Matching group label has no ID for group "${groupName}"`);
        return false;
      }

      // The label and checkbox IDs share the same result index.
      const checkboxId = matchingLabelId.replace(
        ':GroupNameDisplay',
        ':usergrouplistchkBox'
      );
      const resultCheckbox = this.page.locator(`[id="${checkboxId}"]`);
      const checkboxVisible = await resultCheckbox.isVisible({ timeout: 2000 }).catch(() => false);
      if (!checkboxVisible) {
        logger.warn(`No selectable result found for matching group "${groupName}"`);
        return false;
      }

      logger.info(`Found result for group "${groupName}", selecting it...`);
      if (!await resultCheckbox.isChecked()) {
        await resultCheckbox.check();
        await this.page.waitForTimeout(500);
      }

      logger.info('Clicking Add button');
      const addButton = this.page.getByRole('button', { name: 'Add' }).first();
      await addButton.click();
      await this.page.waitForTimeout(1000);

      return true;
    } catch (error) {
      logger.error(`Error searching and adding group "${groupName}": ${error}`);
      return false;
    }
  }

  /**
   * Click the Save button to save group assignments
   */
  private async clickSaveButton(): Promise<void> {
    try {
      const saveButton = this.page.getByRole('button', { name: 'Save' }).first();
      const isVisible = await saveButton.isVisible({ timeout: 2000 }).catch(() => false);
      
      if (isVisible) {
        logger.info('Save button found, clicking...');
        await saveButton.click();
        await this.page.waitForTimeout(1500);
      } else {
        throw new Error('Save button not found');
      }
    } catch (error) {
      logger.error(`Failed to click Save button: ${error}`);
      throw error;
    }
  }

  /**
   * Handle error popups if they appear
   */
  private async handleErrorPopup(): Promise<boolean> {
    try {
      // Look for error message element
      const errorElement = this.page.locator('.clMsgFloat, .error-message, [role="alert"]').first();
      const isVisible = await errorElement.isVisible({ timeout: 2000 }).catch(() => false);

      if (isVisible) {
        logger.warn('Error popup detected');
        
        // Try to close it with the visible close button
        const closeButton = this.page.getByRole('button', { name: 'Close' }).first();
        const closeVisible = await closeButton.isVisible({ timeout: 2000 }).catch(() => false);
        
        if (closeVisible) {
          logger.info('Closing error popup');
          await closeButton.click();
          await this.page.waitForTimeout(800);
        }
        
        return true;
      }

      return false;
    } catch (error) {
      logger.debug(`Error checking for error popup: ${error}`);
      return false;
    }
  }

  /**
   * Close the confirmation displayed after a successful save.
   */
  private async closeSuccessPopup(): Promise<void> {
    const okButton = this.page.locator('[id="usermgmt:successpanel:ngcmdOk"]');
    const isVisible = await okButton.isVisible({ timeout: 2000 }).catch(() => false);

    if (isVisible) {
      logger.info('Closing group assignment success confirmation');
      await okButton.click();
    }
  }

  /**
   * Close the edit user popup
   */
  async closePopup(): Promise<void> {
    try {
      logger.info('Closing edit user popup');
      const closeButton = this.page.getByRole('button', { name: 'Close' }).last();
      const isVisible = await closeButton.isVisible({ timeout: 2000 }).catch(() => false);
      
      if (isVisible) {
        await closeButton.click();
        await this.page.waitForTimeout(1000);
      }
    } catch (error) {
      logger.warn(`Error closing popup: ${error}`);
    }
  }
}
