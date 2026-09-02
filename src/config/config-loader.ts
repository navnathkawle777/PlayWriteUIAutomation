import * as fs from 'node:fs';
import * as yaml from 'yaml';
import * as dotenv from 'dotenv';

dotenv.config();

export interface EnvironmentConfig {
  environment: string;
  newgen: {
    baseUrl: string;
    homeUrl: string;
    UserUrl: string;
    loginPageUrl: string;
    overduePromptUrl: string;
    overduePrompt?: {
      closeButtonSelectors?: string[];
      timeout?: number;
    };
    loginTimeout: number;
    pageTimeout: number;
  };
  execution: {
    headless: boolean;
    slowMo: number;
    maxRetries: number;
    continueOnError: boolean;
    screenshotOnSuccess: boolean;
    screenshotOnFailure: boolean;
    captureTrace: boolean;
    captureVideo: boolean;
  };
  evidence: {
    outputDir: string;
    retentionDays: number;
  };
  security: {
    credentialSource: string;
    usernameKey: string;
    passwordKey: string;
  };
}

export class ConfigLoader {
  static loadEnvironmentConfig(env: string): EnvironmentConfig {
    const configPath = `./config/env.${env}.yaml`;
    
    if (!fs.existsSync(configPath)) {
      throw new Error(`Configuration file not found: ${configPath}`);
    }

    const fileContent = fs.readFileSync(configPath, 'utf8');
    return yaml.parse(fileContent);
  }

  static loadYamlConfig(filename: string): any {
    const configPath = `./config/${filename}`;
    
    if (!fs.existsSync(configPath)) {
      throw new Error(`Configuration file not found: ${configPath}`);
    }

    const fileContent = fs.readFileSync(configPath, 'utf8');
    return yaml.parse(fileContent);
  }

  static getCredentials(config: EnvironmentConfig): { username: string; password: string } {
    const username = process.env[config.security.usernameKey];
    const password = process.env[config.security.passwordKey];

    if (!username || !password) {
      throw new Error(
        `Credentials not found. Please set ${config.security.usernameKey} and ${config.security.passwordKey} in .env file`
      );
    }

    return { username, password };
  }
}