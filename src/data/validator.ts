import { UserRecord, ValidationError } from './models';
import { logger } from '../config/logger';

export class Validator {
  private mandatoryFields: string[];
  private allowedActions: string[];
  private allowedGroups: string[];
  private allowedRoles: string[];
  private emailRegex: RegExp;

  constructor(
    validationConfig: any,
    groupsConfig: any,
    rolesConfig: any
  ) {
    this.mandatoryFields = validationConfig.mandatoryFields;
    this.allowedActions = validationConfig.allowedActions;
    this.allowedGroups = groupsConfig.allowedGroups;
    this.allowedRoles = rolesConfig.allowedRoles;
    this.emailRegex = new RegExp(validationConfig.emailRegex);
  }

  validate(users: UserRecord[]): { valid: UserRecord[]; errors: ValidationError[] } {
    const valid: UserRecord[] = [];
    const errors: ValidationError[] = [];

    for (const user of users) {
      const userErrors = this.validateUser(user);
      
      if (userErrors.length === 0) {
        valid.push(user);
      } else {
        errors.push(...userErrors);
      }
    }

    logger.info(`Validation complete: ${valid.length} valid, ${errors.length} errors`);

    return { valid, errors };
  }

  private validateUser(user: UserRecord): ValidationError[] {
    const errors: ValidationError[] = [];

    // Check mandatory fields
    for (const field of this.mandatoryFields) {
      if (!user[field as keyof UserRecord]) {
        errors.push({
          request_id: user.request_id,
          field,
          error: `Missing mandatory field: ${field}`
        });
      }
    }

    // Validate email format
    if (user.email && !this.emailRegex.test(user.email)) {
      errors.push({
        request_id: user.request_id,
        field: 'email',
        error: 'Invalid email format'
      });
    }

    // Validate action
    if (user.action && !this.allowedActions.includes(user.action)) {
      errors.push({
        request_id: user.request_id,
        field: 'action',
          error: `Invalid action. Allowed: ${this.allowedActions.join(', ')}`
      });
    }

    // // Validate groups
    // if (user.groups) {
    //   const groups = user.groups.split(',').map(g => g.trim());
    //   for (const group of groups) {
    //     if (!this.allowedGroups.includes(group)) {
    //       errors.push({
    //         request_id: user.request_id,
    //         field: 'groups',
    //         error: `Invalid group: ${group}`
    //       });
    //     }
    //   }
    // }

    // Validate roles
    if (user.roles) {
      const roles = user.roles.split(',').map(r => r.trim());
      for (const role of roles) {
        if (!this.allowedRoles.includes(role)) {
          errors.push({
            request_id: user.request_id,
            field: 'roles',
            error: `Invalid role: ${role}`
          });
        }
      }
    }

    return errors;
  }
}