import { Page } from '@playwright/test';
import { UserRecord } from '../data/models';
import { logger } from '../config/logger';
import { UserManagementPage } from './user-management.page';

interface FieldConfig {
  selector: string;
  type: 'text' | 'select' | 'multiselect';
  visibilityDependency?: { field: string; value: string };
}

export class AddUserPage {
  // Field mapping from XLSX columns to page selectors and types
  private readonly fieldMap: Record<string, FieldConfig> = {
    first_name: {
      selector: '[id="usermgmt:txtPersonalName"]',
      type: 'text'
    },
    last_name: {
      selector: '[id="usermgmt:txtFamilyName"]',
      type: 'text'
    },
    email: {
      selector: '[id="usermgmt:txtEmailId"]',
      type: 'text'
    },
    country: {
      selector: 'select[name="usermgmt:fieldTable:10:fieldValueSP"]',
      type: 'select'
    },
    security: {
      selector: 'select[name="usermgmt:fieldTable:11:fieldValueSP"]',
      type: 'select'
    },
    division: {
      selector: 'select[name="usermgmt:fieldTable:17:fieldValueSP"]',
      type: 'select'
    },
    scheme: {
      selector: 'select[name="usermgmt:fieldTable:18:fieldValueSP"]',
      type: 'select'
    },
    cluster: {
      selector: 'select[name="usermgmt:fieldTable:22:fieldValueSP"]',
      type: 'select',
      visibilityDependency: { field: 'division', value: 'visible' }
    },
    team: {
      selector: '[id*="usermgmt"] [id*="fieldTable"] [id*="fieldValueS"]',
      type: 'multiselect',
      visibilityDependency: { field: 'division', value: 'visible' }
    }
  };

  constructor(
    private readonly page: Page,
    private readonly userManagementPage?: UserManagementPage,
    private readonly screenshotCallback?: (page: Page, username: string, status: string) => Promise<string | void>
  ) {}

  async createUser(user: UserRecord): Promise<void> {
    logger.info(`Creating user: ${user.username}`);

    // Populate fields in the specified sequence
    await this.populateFieldsInSequence(user);

    logger.info(`Clicking Save button for user: ${user.username}`);
    await this.page.getByRole('button', { name: /save/i }).click();

    // Capture screenshot immediately after clicking save
    logger.info('Save button clicked, capturing screenshot...');
    await this.page.waitForTimeout(1000);
    if (this.screenshotCallback) {
      await this.screenshotCallback(this.page, user.username, 'AFTER_SAVE');
    }

    await this.waitForSubmissionResult(user.username);
  }

  private async populateFieldsInSequence(user: UserRecord): Promise<void> {
    logger.info('Populating fields in sequence...');

    // Define the exact sequence of field population
    const fieldSequence = [
      { field: 'username', selector: '[id="usermgmt:txtUserName"]', type: 'text' },
      { field: 'password', selector: '[id="usermgmt:txtPassword"]', type: 'text' },
      { field: 'confirm_password', selector: '[id="usermgmt:txtConfirmPassword"]', type: 'text' },
      { field: 'remarks', selector: '[id="usermgmt:txtcomments"]', type: 'text' },
      { field: 'first_name', selector: '[id="usermgmt:txtPersonalName"]', type: 'text' },
      { field: 'last_name', selector: '[id="usermgmt:txtFamilyName"]', type: 'text' },
      { field: 'email', selector: '[id="usermgmt:txtEmailId"]', type: 'text' },
      { field: 'country', selector: 'select[name="usermgmt:fieldTable:10:fieldValueSP"]', type: 'select' },
      { field: 'security', selector: 'select[name="usermgmt:fieldTable:11:fieldValueSP"]', type: 'select' },
      { field: 'division', selector: 'select[name="usermgmt:fieldTable:13:fieldValueSP"]', type: 'select' },
      { field: 'scheme', selector: 'select[name="usermgmt:fieldTable:17:fieldValueSP"]', type: 'select' },
      { field: 'cluster', selector: 'select[name="usermgmt:fieldTable:22:fieldValueSP"]', type: 'select' },
      { field: 'team', selector: '[id*="usermgmt"] [id*="fieldTable"] [id*="fieldValueS"]', type: 'multiselect' }
    ];

    for (const config of fieldSequence) {
      await this.processFieldInSequence(user, config);
    }

    // Handle any dynamic/custom fields not in the sequence
    await this.populateDynamicFields(user);
  }

  private async processFieldInSequence(user: UserRecord, config: any): Promise<void> {
    let value = (user as Record<string, any>)[config.field];
    value = this.getFieldValue(config.field, value, user);

    if (!value || String(value).trim() === '') {
      logger.info(`Skipping field ${config.field} - no value provided`);
      return;
    }

    // Fill based on type
    if (config.type === 'text') {
      await this.fillTextField(config.selector, String(value));
    } else if (config.type === 'select') {
      await this.selectDropdownOption(config.selector, String(value));
      if (config.field === 'division') {
        logger.info('Division selected - waiting for dependent fields (cluster/team) to render...');
        await this.page.waitForTimeout(1500);
      }
    } else if (config.type === 'multiselect') {
      const values = String(value).split(',').map(v => v.trim());
      await this.selectMultipleOptions(config.field, values);
    }

    await this.page.waitForTimeout(300);
  }

  private getFieldValue(fieldName: string, value: any, user: UserRecord): string {
    if (fieldName === 'password' && !value) {
      return 'System12345#';
    }
    if (fieldName === 'confirm_password') {
      return (user as Record<string, any>)['password'] || 'System12345#';
    }
    if (fieldName === 'remarks' && !value) {
      return `TEST User ${(user as Record<string, any>)['username']}`;
    }
    return value;
  }

  private async populateDynamicFields(user: UserRecord): Promise<void> {
    const ignoredKeys = new Set([
      'request_id', 'action', 'groups', 'roles', 'username', 'first_name', 'last_name', 'email',
      'password', 'confirmPassword', 'confirm_password', 'remarks', 'department', 'user_type',
      'country', 'security', 'division', 'scheme', 'cluster', 'team', 'status'
    ]);

    const dynamicKeys = Object.keys(user).filter((key) => !ignoredKeys.has(key));

    for (const key of dynamicKeys) {
      const value = (user as Record<string, any>)[key];
      if (!value || String(value).trim() === '') continue;

      await this.fillDynamicField(key, String(value).trim());
    }
  }

  private async fillTextField(selector: string, value: string): Promise<void> {
    try {
      const field = this.page.locator(selector);
      await field.waitFor({ state: 'visible', timeout: 10000 });
      
      // Scroll element into view if needed
      await field.scrollIntoViewIfNeeded();
      await this.page.waitForTimeout(300);
      
      await field.click();
      await field.fill(value);
      logger.info(`Filled text field ${selector} with value: ${value}`);
    } catch (error) {
      logger.warn(`Failed to fill text field ${selector}: ${error}`);
    }
  }

  private async selectDropdownOption(selector: string, value: string): Promise<void> {
    try {
      let dropdown = this.page.locator(selector);
      let count = await dropdown.count();

      // For cluster field, try variants if not found
      if (count === 0 && selector.includes('22')) {
        logger.info(`Cluster field selector not found, trying variants...`);
        const variants = [
          'select[name="usermgmt:fieldTable:22:fieldValueS"]',
          'select[name="usermgmt:fieldTable22:fieldValueS"]',
          'select[name*="fieldTable"][name*="fieldValueS"]'
        ];

        for (const variant of variants) {
          dropdown = this.page.locator(variant);
          count = await dropdown.count();
          if (count > 0) {
            logger.info(`Found cluster field with variant selector: ${variant}`);
            break;
          }
        }
      }

      if (count === 0) {
        logger.warn(`Dropdown not found for selector: ${selector}`);
        return;
      }

      await dropdown.waitFor({ state: 'visible', timeout: 10000 });
      
      // Scroll element into view if needed
      await dropdown.scrollIntoViewIfNeeded();
      await this.page.waitForTimeout(300);

      await dropdown.selectOption({ label: value }).catch(async () => {
        await dropdown.selectOption(value);
      });

      logger.info(`Selected option "${value}" from dropdown`);
    } catch (error) {
      logger.warn(`Failed to select option from dropdown ${selector}: ${error}`);
    }
  }



  private async selectMultipleOptions(fieldName: string, values: string[]): Promise<void> {
    try {
      logger.info(`Selecting ${values.length} option(s) for ${fieldName}: ${values.join(', ')}`);

      if (!values || values.length === 0) {
        logger.info(`No values to select for ${fieldName}`);
        return;
      }

      // Find the multiselect field for team
      logger.info(`Step 1: Finding multiselect field for ${fieldName}`);
      const multiSelectField = await this.findTeamMultiSelectField();
      
      if (!multiSelectField) {
        logger.warn(`Could not find multiselect field for ${fieldName}, skipping...`);
        return;
      }

      // Scroll into view
      logger.info(`Step 2: Scrolling field into view`);
      try {
        await multiSelectField.scrollIntoViewIfNeeded();
      } catch (e) {
        logger.warn(`Could not scroll: ${e}`);
      }
      await this.page.waitForTimeout(400);

      // Select each value
      logger.info(`Step 3: Selecting ${values.length} individual option(s)`);
      for (let i = 0; i < values.length; i++) {
        const value = values[i].trim();
        await this.selectSingleTeamOption(multiSelectField, fieldName, value, i, values.length);
      }

      logger.info(`Successfully completed selection of all ${values.length} options for ${fieldName}`);
    } catch (error) {
      logger.error(`Failed to select multiple options for ${fieldName}: ${error}`);
    }
  }

  private async selectSingleTeamOption(multiSelectField: any, fieldName: string, value: string, index: number, total: number): Promise<void> {
    logger.info(`  Selecting option ${index + 1}/${total}: "${value}"`);

    // Click to activate the field - click the SELECT2 CONTAINER, not the hidden select element
    logger.info(`    Clicking field to activate dropdown`);
    try {
      // Find the visible Select2 container div that wraps the hidden select element
      const selectId = await multiSelectField.getAttribute('id');
      const select2Container = this.page.locator(`span[aria-labelledby*="${selectId}"], [aria-controls*="${selectId}"], .select2-container[id*="${selectId}"]`).first();
      const containerExists = await select2Container.isVisible({ timeout: 2000 }).catch(() => false);
      
      if (containerExists) {
        logger.info(`    Found Select2 container, clicking it`);
        await select2Container.click({ force: true });
      } else {
        logger.info(`    Select2 container not found, clicking field directly`);
        await multiSelectField.click({ force: true });
      }
    } catch (clickError) {
      logger.warn(`Click failed, trying keyboard: ${clickError}`);
      await multiSelectField.focus();
      await this.page.keyboard.press('Space');
    }
    await this.page.waitForTimeout(800);

    // Try to select via searchbox
    const searchBox = this.page.getByRole('searchbox').first();
    const searchBoxVisible = await searchBox.isVisible().catch(() => false);
    
    if (searchBoxVisible) {
      const found = await this.selectOptionViaSearchBox(fieldName, value, searchBox);
      if (!found) {
        logger.warn(`    Value "${value}" not found in dropdown options, skipping this value`);
      }
    } else {
      logger.warn(`    Searchbox not visible, trying direct option selection`);
      const found = await this.selectOptionDirectly(fieldName, value);
      if (!found) {
        logger.warn(`    Value "${value}" not found, skipping this value`);
      }
    }
  }

  private async findTeamMultiSelectField(): Promise<any> {
    try {
      logger.info(`Finding team multiselect field`);
      
      // Look for the team field by finding label "Team" and then the associated select2 container
      const allLabels = this.page.locator('label');
      const labelCount = await allLabels.count();
      
      logger.info(`Found ${labelCount} labels on page`);

      for (let i = 0; i < labelCount; i++) {
        const label = allLabels.nth(i);
        const labelText = await label.textContent().catch(() => '');
        
        if (labelText?.toLowerCase().includes('team')) {
          logger.info(`Found Team label: "${labelText}"`);
          
          // Try to get the select2 container
          const select2Container = this.page.locator('[class*="select2"]').first();
          const isVisible = await select2Container.isVisible().catch(() => false);
          
          if (isVisible) {
            logger.info(`Found visible team field container`);
            return select2Container;
          }
        }
      }

      // Fallback: Try to find by looking for select2 containers in the form area
      logger.info(`Team label not found, using fallback method`);
      const select2Containers = this.page.locator('[class*="select2-container"]');
      const count = await select2Containers.count();
      
      logger.info(`Found ${count} select2 containers`);
      
      // Usually team is the last visible select2 container in the field area
      if (count > 0) {
        for (let i = count - 1; i >= 0; i--) {
          const container = select2Containers.nth(i);
          const isVisible = await container.isVisible({ timeout: 2000 }).catch(() => false);
          if (isVisible) {
            logger.info(`Found visible select2 container at index ${i}`);
            return container;
          }
        }
      }

      logger.warn(`No team multiselect field found`);
      return null;
    } catch (error) {
      logger.warn(`Error finding team multiselect field: ${error}`);
      return null;
    }
  }

  private async selectSingleMultiSelectOption(fieldName: string, value: string): Promise<void> {
    try {
      logger.info(`Searching for and selecting option "${value}" in multi-select field ${fieldName}`);
      
      // Try to use searchbox if available (Select2 / Combobox pattern)
      const searchBox = this.page.getByRole('searchbox').first();
      const searchBoxVisible = await searchBox.isVisible({ timeout: 2000 }).catch(() => false);

      if (searchBoxVisible) {
        // Try the searchbox approach
        await this.selectOptionViaSearchBox(fieldName, value, searchBox);
        return;
      }

      // Fallback: Try to find and click the option directly from the dropdown list
      await this.selectOptionDirectly(fieldName, value);
      
    } catch (error) {
      logger.warn(`Failed to select option "${value}" for ${fieldName}: ${error}`);
    }
  }

  private async selectOptionViaSearchBox(fieldName: string, value: string, searchBox: any): Promise<boolean> {
    try {
      logger.info(`Using searchbox to find option "${value}"`);
      
      // Focus on the searchbox without clicking to avoid pointer interception
      logger.info(`    Focusing searchbox`);
      await searchBox.focus();
      await this.page.waitForTimeout(200);

      // Clear any existing text
      logger.info(`    Clearing searchbox`);
      await searchBox.fill('');
      await this.page.waitForTimeout(300);

      // Type the value with delay
      logger.info(`    Typing value: "${value}"`);
      await searchBox.type(value, { delay: 100 });
      await this.page.waitForTimeout(1000);

      // Wait for dropdown options to appear
      logger.info(`    Waiting for dropdown options to appear`);
      await this.page.waitForTimeout(800);

      // Try exact match first
      logger.info(`    Looking for exact match option`);
      const exactOption = this.page.getByRole('option', { name: new RegExp(`^${value}$`, 'i') }).first();
      const exactVisible = await exactOption.isVisible({ timeout: 2000 }).catch(() => false);

      if (exactVisible) {
        logger.info(`    Found exact match, clicking option for "${value}"`);
        await exactOption.click();
        await this.page.waitForTimeout(700);
        return true;
      }

      // Try partial match
      logger.warn(`    Exact match not found for "${value}", trying partial match`);
      const partialOption = this.page.getByRole('option', { name: new RegExp(value, 'i') }).first();
      const partialVisible = await partialOption.isVisible({ timeout: 2000 }).catch(() => false);
      
      if (partialVisible) {
        logger.info(`    Found partial match, clicking option for "${value}"`);
        await partialOption.click();
        await this.page.waitForTimeout(700);
        return true;
      }

      logger.warn(`    No match found for "${value}" in dropdown`);
      return false;
    } catch (error) {
      logger.warn(`Searchbox approach failed: ${error}`);
      return false;
    }
  }

  private async selectOptionDirectly(fieldName: string, value: string): Promise<boolean> {
    try {
      logger.info(`Trying direct selection of option "${value}"`);
      
      // Look for the option in various list patterns
      const selectors = [
        `//li[contains(text(), "${value}")]`,
        `//div[contains(text(), "${value}")]`,
        `//*[contains(text(), "${value}")]`
      ];

      for (const selector of selectors) {
        try {
          const option = this.page.locator(`xpath=${selector}`).first();
          const isVisible = await option.isVisible().catch(() => false);
          
          if (isVisible) {
            await option.click();
            logger.info(`Selected option "${value}" directly for ${fieldName} using xpath`);
            return true;
          }
        } catch (selectorError) {
          logger.debug(`Xpath selector ${selector} not found: ${selectorError}`);
        }
      }

      // Try with getByRole if available
      const option = this.page.getByRole('option', { name: new RegExp(value, 'i') }).first();
      const isVisible = await option.isVisible().catch(() => false);
      
      if (isVisible) {
        await option.click();
        logger.info(`Selected option "${value}" directly for ${fieldName} using role selector`);
        return true;
      }

      logger.warn(`Could not select option "${value}" directly for ${fieldName}`);
      return false;
    } catch (error) {
      logger.warn(`Direct selection approach failed: ${error}`);
      return false;
    }
  }

  private async fillDynamicField(fieldName: string, value: string): Promise<void> {
    const candidateSelectors = [
      `[id="${fieldName}"]`,
      `[name="${fieldName}"]`,
      `[id="usermgmt:${fieldName}"]`,
      `[name="usermgmt:${fieldName}"]`
    ];

    for (const selector of candidateSelectors) {
      try {
        const component = this.page.locator(selector);
        const count = await component.count();

        if (count > 0) {
          const isVisible = await component.isVisible({ timeout: 3000 }).catch(() => false);
          if (!isVisible) continue;

          // Scroll element into view if needed
          await component.scrollIntoViewIfNeeded();
          await this.page.waitForTimeout(300);

          const tag = await component.evaluate((el) => el.tagName.toLowerCase());

          if (tag === 'select') {
            await this.selectDropdownOption(selector, value);
          } else {
            await this.fillTextField(selector, value);
          }

          logger.info(`Filled dynamic field ${fieldName} using selector ${selector}`);
          return;
        }
      } catch (candidateError) {
        logger.debug(`Candidate selector ${selector} not found for ${fieldName}: ${candidateError}`);
      }
    }

    logger.warn(`No element found for dynamic field: ${fieldName}`);
  }

  private async waitForSubmissionResult(username: string): Promise<void> {
    // Wait for server response
    await this.page.waitForTimeout(1500);

    // Check for error message
    const errorHandled = await this.handleErrorPopup(username);
    if (errorHandled) {
      throw new Error('User creation failed - error popup was shown');
    }

    // Check for success message
    const successHandled = await this.handleSuccessPopup(username);
    if (successHandled) {
      logger.info(`User creation successful for ${username}`);
      return;
    }

    // Fallback: Verify user creation by searching
    await this.verifyUserCreationViaSearch(username);
  }

  private async handleErrorPopup(username: string): Promise<boolean> {
    try {
      const errorBox = this.page.locator('.erMsgFloat, #erMsgFloat');
      const isVisible = await errorBox.isVisible({ timeout: 5000 }).catch(() => false);

      if (!isVisible) {
        return false;
      }

      // Extract error message
      const errorText = (await errorBox.textContent())?.trim() || 'Unknown error';
      logger.error(`User creation failed: ${errorText}`);

      // Capture error screenshot
      if (this.screenshotCallback) {
        logger.info('Capturing screenshot of error state...');
        await this.screenshotCallback(this.page, username, 'ERROR');
      }

      // Try to close the error popup
      await this.closeErrorPopup(errorBox);

      return true;
    } catch (error) {
      logger.warn(`Error handling popup check failed: ${error}`);
      return false;
    }
  }

  private async closeErrorPopup(errorBox: any): Promise<void> {
    try {
      const closeButton = this.page.getByRole('button', { name: /ok|close|done/i }).first();
      const isVisible = await closeButton.isVisible({ timeout: 2000 }).catch(() => false);

      if (isVisible) {
        logger.info('Error popup has close button, clicking it...');
        await closeButton.click();

        const stillVisible = await errorBox.isVisible({ timeout: 2000 }).catch(() => false);
        if (stillVisible) {
          logger.warn('Error popup still visible after close button - not auto-closing');
        } else {
          logger.info('Error popup closed successfully');
        }
      } else {
        logger.info('No close button found, waiting for auto-close...');
        const autoClosedAfterWait = await errorBox.isVisible({ timeout: 5000 }).catch(() => false);
        if (!autoClosedAfterWait) {
          logger.info('Error popup auto-closed after waiting');
        } else {
          logger.warn('Error popup did not auto-close');
        }
      }
    } catch (error) {
      logger.warn(`Failed to close error popup: ${error}`);
    }
  }

  private async handleSuccessPopup(username: string): Promise<boolean> {
    try {
      const successMessage = this.page.locator('text=/success|saved successfully|user created successfully/i');
      const isVisible = await successMessage.isVisible({ timeout: 10000 }).catch(() => false);

      if (!isVisible) {
        return false;
      }

      const text = (await successMessage.textContent())?.trim() || 'User created successfully';
      logger.info(`User creation success: ${text}`);

      // Capture success screenshot
      if (this.screenshotCallback) {
        logger.info('Capturing screenshot of success state...');
        await this.screenshotCallback(this.page, username, 'SUCCESS');
      }

      // Close the popup
      await this.closeSuccessPopup();

      return true;
    } catch (error) {
      logger.warn(`Success popup check failed: ${error}`);
      return false;
    }
  }

  private async closeSuccessPopup(): Promise<void> {
    try {
      const closeButton = this.page.getByRole('button', { name: /ok|close|done/i }).first();
      const isVisible = await closeButton.isVisible({ timeout: 3000 }).catch(() => false);

      if (isVisible) {
        logger.info('Success popup has close button, clicking it...');
        await closeButton.click();
      } else {
        logger.info('No close button visible in success popup');
      }

      await this.page.waitForEvent('close', { timeout: 5000 }).catch(() => undefined);
    } catch (error) {
      logger.warn(`Failed to close success popup: ${error}`);
    }
  }

  private async verifyUserCreationViaSearch(username: string): Promise<void> {
    logger.warn('No success or error message detected. Verifying user creation via search...');

    if (!this.userManagementPage) {
      logger.warn(`User creation status unknown for ${username} - no verification method available`);
      if (this.screenshotCallback) {
        await this.screenshotCallback(this.page, username, 'UNKNOWN_STATE');
      }
      return;
    }

    try {
      const userExists = await this.userManagementPage.searchUser(username);

      if (userExists) {
        logger.info(`User creation confirmed via search: ${username}`);
        if (this.screenshotCallback) {
          await this.screenshotCallback(this.page, username, 'VERIFIED');
        }
      } else {
        logger.error(`User creation verification failed: ${username} not found in search`);
        if (this.screenshotCallback) {
          await this.screenshotCallback(this.page, username, 'NOT_FOUND');
        }
        throw new Error(`User ${username} was not found after creation attempt`);
      }
    } catch (error) {
      logger.error(`Failed to verify user creation via search: ${error}`);
      if (this.screenshotCallback) {
        await this.screenshotCallback(this.page, username, 'VERIFICATION_FAILED');
      }
      throw error;
    }
  }
}
