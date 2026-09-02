//import * as fs from 'node:fs';
import { ConfigLoader } from './config/config-loader';
import { ExcelReader } from './data/excel-reader';
import { Validator } from './data/validator';
import { ProvisioningService } from './services/provisioning.service';
import { ReportService } from './services/report.service';
import { logger } from './config/logger';

interface CliOptions {
  env: string;
  dryRun: boolean;
}

function parseArgs(args: string[]): CliOptions {
  const envIndex = args.indexOf('--env');
  const env = envIndex >= 0 && args[envIndex + 1] ? args[envIndex + 1] : 'uat';

  return {
    env,
    dryRun: args.includes('--dry-run')
  };
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const config = ConfigLoader.loadEnvironmentConfig(options.env);
  const inputPath = './input/users.xlsx';
  const users = ExcelReader.readUsers(inputPath);
  const validator = new Validator(
    ConfigLoader.loadYamlConfig('validation.yaml'),
    ConfigLoader.loadYamlConfig('groups.yaml'),
    ConfigLoader.loadYamlConfig('roles.yaml')
  );
  const validation = validator.validate(users);
  const reportService = new ReportService(config.evidence.outputDir);

  if (validation.errors.length > 0) {
    reportService.generateValidationReport(validation.errors);
    // Update Excel file with validation errors immediately
    ExcelReader.updateValidationErrors(inputPath, validation.errors);
  }

  if (options.dryRun) {
    logger.info(`Dry run complete: ${validation.valid.length} valid records`);
    return;
  }

  if (validation.valid.length === 0) {
    logger.info('No valid users to provision');
    return;
  }

  const credentials = ConfigLoader.getCredentials(config);
  const provisioningService = new ProvisioningService(config, credentials);

  try {
    await provisioningService.initialize();
    await provisioningService.login();
    const results = await provisioningService.provisionUsers(validation.valid);
    
    // Generate reports
    reportService.generateExecutionReport(results);
    
    // Update Excel file with execution results (status and message)
    ExcelReader.updateResults(inputPath, results);
    
    logger.info('Provisioning completed successfully');
  } catch (error) {
    logger.error(`Provisioning failed: ${error}`);
    throw error;
  } finally {
    try {
      logger.info('Starting cleanup');
      await provisioningService.close();
    } catch (closeError) {
      logger.error(`Cleanup failed: ${closeError}`);
    }
  }
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
