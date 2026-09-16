import { Page } from '@playwright/test';
import { logger } from '../config/logger';

interface GroupRoleAssignments {
  groupName: string;
  roleNames: string[];
}

export class AddUserToGroupRolePage {
  constructor(private readonly page: Page) {}

  async addUserToGroupRoles(username: string, roles: string): Promise<boolean> {
    try {
      const assignments = this.parseAssignments(roles);

      for (const { groupName, roleNames } of assignments) {
        logger.info(`Selecting group "${groupName}" for role assignment`);
        const groupSelected = await this.selectExactGroup(groupName);
        if (!groupSelected) {
          logger.warn(`Group "${groupName}" was not found; skipping its roles`);
          continue;
        }

        const editGroupPopup = await this.openEditGroupDialog();
        await this.addRolesToGroup(editGroupPopup, username, roleNames);
      }

      return true;
    } catch (error) {
      logger.error(`Failed to add user to group roles: ${error}`);
      return false;
    }
  }

  private parseAssignments(roles: string): GroupRoleAssignments[] {
    const assignments = new Map<string, string[]>();

    for (const value of roles.split(',').map(role => role.trim()).filter(Boolean)) {
      const separatorIndex = value.indexOf('#');
      if (separatorIndex <= 0 || separatorIndex === value.length - 1) {
        throw new Error(`Invalid role assignment "${value}". Expected Group#Role`);
      }

      const groupName = value.slice(0, separatorIndex).trim();
      const roleName = value.slice(separatorIndex + 1).trim();
      const groupRoles = assignments.get(groupName) ?? [];
      groupRoles.push(roleName);
      assignments.set(groupName, groupRoles);
    }

    if (assignments.size === 0) {
      throw new Error('Roles field contains no group-role assignments');
    }

    return Array.from(assignments, ([groupName, roleNames]) => ({ groupName, roleNames }));
  }

  private async selectExactGroup(groupName: string): Promise<boolean> {
    const frame = this.page.locator('iframe[name="iframe_Int34"]').contentFrame();
    await frame.getByText('Group', { exact: true }).click();

    const searchField = frame.locator('[id="profilemgmt:Prefix"]');
    await searchField.fill(groupName);
    await searchField.press('Enter');

    const escapedGroupName = groupName.replace(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`);
    const matchingGroupLabel = frame.locator(
      '[id^="profilemgmt:grouplist:"][id$=":groupName"]'
    ).filter({ hasText: new RegExp(`^${escapedGroupName}$`) }).first();
    const noGroupsFound = frame.getByText('No Groups Found', { exact: true }).first();

    await Promise.race([
      matchingGroupLabel.waitFor({ state: 'visible', timeout: 10000 }),
      noGroupsFound.waitFor({ state: 'visible', timeout: 10000 })
    ]);

    if (await noGroupsFound.isVisible().catch(() => false)) {
      return false;
    }

    const labelId = await matchingGroupLabel.getAttribute('id');
    if (!labelId) {
      return false;
    }

    const checkboxId = labelId.replace(':groupName', ':chkGroup');
    const checkbox = frame.locator(`[id="${checkboxId}"]`);
    await checkbox.check();
    logger.info(`Selected exact group "${groupName}"`);
    return true;
  }

  private async openEditGroupDialog(): Promise<Page> {
    const popupPromise = this.page.waitForEvent('popup');
    const frame = this.page.locator('iframe[name="iframe_Int34"]').contentFrame();
    await frame.locator('[id="profilemgmt:more3"]').getByRole('cell', { name: 'Modify' }).click();
    const popup = await popupPromise;
    await popup.waitForLoadState('domcontentloaded');
    return popup;
  }

  private async addRolesToGroup(popup: Page, username: string, roleNames: string[]): Promise<void> {
    await popup.getByText('User/Role Association', { exact: true }).click();

    const userSelect = popup.locator('select[name="groupmgmt:j_idt1048"]');
    const roleSelect = popup.locator('select[name="groupmgmt:j_idt1052"]');
    await userSelect.selectOption({ label: username });

    for (const roleName of roleNames) {
      await roleSelect.selectOption({ label: roleName });
      popup.once('dialog', dialog => dialog.accept().catch(() => {}));
      await popup.getByRole('button', { name: 'Add', exact: true }).click();
      logger.info(`Added role "${roleName}" for user "${username}"`);
    }
    await this.page.waitForTimeout(200);
    await popup.getByRole('button', { name: 'Save', exact: true }).click();
     await this.page.waitForTimeout(1500);
    const okButton = popup.locator('[id="groupmgmt:successpanel:cmdOk"]');
    if (await okButton.isVisible({ timeout: 3000 }).catch(() => false)) {
      await okButton.click();
    }
  }
}
