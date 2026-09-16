import { Page } from '@playwright/test';
import { logger } from '../config/logger';

export type LayoutView = 'View-Full' | 'AGC';

export class SaveUserPreferenceLayoutPage {
  constructor(private readonly page: Page) {}

  async saveLayout(username: string): Promise<LayoutView> {
    logger.info(`Saving user preference layout for "${username}"`);
    const selectedView = await this.selectView(username);
    await this.page.waitForLoadState('networkidle').catch(() => {});

    // Re-open the user menu so "Save Layout" is available after the view has loaded
    const usernameLink = this.page.getByText(username, { exact: true });
    await usernameLink.click();

    await this.clickSaveLayout();
    await this.waitForSaveToast();
    logger.info(`Layout saved for "${username}" using "${selectedView}" view`);
    return selectedView;
  }

  private async selectView(username: string): Promise<LayoutView> {
    const usernameLink = this.page.getByText(username, { exact: true });

    await usernameLink.click();
    const viewFullOption = this.page
      .locator('[id="form:dataTable"] div')
      .filter({ hasText: 'View-Full' })
      .first();

    // View-Full is the preferred layout; fall back to the AGC view when it's unavailable
    if (await viewFullOption.isVisible({ timeout: 3000 }).catch(() => false)) {
      await viewFullOption.click();
      logger.info('Selected "View-Full" layout option');
      return 'View-Full';
    }

    logger.warn('"View-Full" option not found, falling back to "AGC" view');
    await usernameLink.click();
    const agcOption = this.page.locator('div').filter({ hasText: 'AGC' }).nth(5);
    await agcOption.click();
    logger.info('Selected "AGC" layout option');
    return 'AGC';
  }

  private async clickSaveLayout(): Promise<void> {
    await this.page.getByText('Save Layout', { exact: true }).click();
  }

  // The "Current view layout has been saved." toast overlays the username label and blocks the next click
  private async waitForSaveToast(): Promise<void> {
    const toaster = this.page.locator('#custom_toaster');
    await toaster.waitFor({ state: 'visible', timeout: 5000 }).catch(() => {});
    await toaster.waitFor({ state: 'hidden', timeout: 10000 }).catch(() => {});
  }
}
