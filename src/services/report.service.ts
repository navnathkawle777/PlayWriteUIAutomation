import * as fs from 'fs';
import * as path from 'path';
import { ExecutionResult, ValidationError } from '../data/models';
import { logger } from '../config/logger';

export class ReportService {
  private reportDir: string;

  constructor(outputDir: string) {
    this.reportDir = path.join(outputDir, 'reports');
    
    if (!fs.existsSync(this.reportDir)) {
      fs.mkdirSync(this.reportDir, { recursive: true });
    }
  }

  generateValidationReport(errors: ValidationError[]): void {
    const timestamp = new Date().toISOString().replace(/:/g, '-').split('.')[0];
    const filename = `validation-errors-${timestamp}.csv`;
    const filepath = path.join(this.reportDir, filename);

    const headers = 'request_id,field,error';
    const rows = errors.map(e => `${e.request_id},${e.field},"${e.error}"`).join('');

    fs.writeFileSync(filepath, headers + rows);
    logger.info(`Validation report generated: ${filepath}`);
  }

  generateExecutionReport(results: ExecutionResult[]): void {
    const timestamp = new Date().toISOString().replace(/:/g, '-').split('.')[0];
    // const csvFilename = `execution-report-${timestamp}.csv`;
    // const csvFilepath = path.join(this.reportDir, csvFilename);

    // const headers = 'request_id,username,action,status,message,screenshot_path,trace_path,timestamp';
    // const rows = results.map(r => 
    //   `${r.request_id},${r.username},${r.action},${r.status},"${r.message}",${r.screenshot_path || ''},${r.trace_path || ''},${r.timestamp}`
    // ).join('');

    // fs.writeFileSync(csvFilepath, headers + rows);

    // Also generate JSON report
    const jsonFilename = `execution-report-${timestamp}.json`;
    const jsonFilepath = path.join(this.reportDir, jsonFilename);
    fs.writeFileSync(jsonFilepath, JSON.stringify(results, null, 2));

    // logger.info(`Execution reports generated: ${csvFilepath}, ${jsonFilepath}`);

    this.printSummary(results);
  }

  private printSummary(results: ExecutionResult[]): void {
    const summary = {
      total: results.length,
      success: results.filter(r => r.status === 'SUCCESS').length,
      failed: results.filter(r => r.status === 'FAILED').length,
      skipped: results.filter(r => r.status === 'SKIPPED').length,
      validation_error: results.filter(r => r.status === 'VALIDATION_ERROR').length
    };

    console.log('========== EXECUTION SUMMARY ==========');
    console.log(`Total Records: ${summary.total}`);
    console.log(`Success: ${summary.success}`);
    console.log(`Failed: ${summary.failed}`);
    console.log(`Skipped: ${summary.skipped}`);
    console.log(`Validation Errors: ${summary.validation_error}`);
    console.log('=======================================');

    logger.info('Execution summary', summary);
  }
}