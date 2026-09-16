import * as XLSX from 'xlsx';
import { UserRecord, ExecutionResult, ValidationError } from './models';
import { logger } from '../config/logger';

export class ExcelReader {
  static readUsers(filePath: string): UserRecord[] {
    logger.info(`Reading Excel file: ${filePath}`);

    const workbook = XLSX.readFile(filePath);
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];

    const data: any[] = XLSX.utils.sheet_to_json(worksheet);

    logger.info(`Found ${data.length} records in Excel`);

    return data.map((row) => ({
      request_id: String(row.request_id || '').trim(),
      username: String(row.username || '').trim(),
      password: row.password ? String(row.password).trim() : undefined,
      first_name: String(row.first_name || '').trim(),
      last_name: String(row.last_name || '').trim(),
      email: String(row.email || '').trim(),
      department: row.department ? String(row.department).trim() : undefined,
      user_type: row.user_type ? String(row.user_type).trim() : undefined,
      groups: String(row.groups || '').trim(),
      roles: String(row.roles || '').trim(),
      action: String(row.action || '').trim().toUpperCase(),
      remarks: row.remarks ? String(row.remarks).trim() : undefined,
      country: row.country ? String(row.country).trim() : undefined,
      security: row.security ? String(row.security).trim() : undefined,
      division: row.division ? String(row.division).trim() : undefined,
      scheme: row.scheme ? String(row.scheme).trim() : undefined,
      cluster: row.cluster ? String(row.cluster).trim() : undefined,
      team: row.team ? String(row.team).trim() : undefined
    }));
  }

  static updateResults(filePath: string, results: ExecutionResult[]): void {
    logger.info(`Updating Excel file with execution results: ${filePath}`);

    try {
      const workbook = XLSX.readFile(filePath);
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];

      // Get the range of the worksheet
      const range = XLSX.utils.decode_range(worksheet['!ref'] || 'A1');

      // Find column indices for request_id, status, and message
      let requestIdColIndex = -1;
      let statusColIndex = -1;
      let messageColIndex = -1;

      // Read header row to find column positions
      for (let col = range.s.c; col <= range.e.c; col++) {
        const cellAddress = XLSX.utils.encode_cell({ r: 0, c: col });
        const cell = worksheet[cellAddress];
        const headerValue = cell?.v?.toString().toLowerCase() || '';

        if (headerValue === 'request_id') requestIdColIndex = col;
        if (headerValue === 'status') statusColIndex = col;
        if (headerValue === 'message') messageColIndex = col;
      }

      if (statusColIndex === -1 || messageColIndex === -1) {
        throw new Error('status and/or message columns not found in Excel');
      }

      // Create map for quick lookup
      const resultMap = new Map(results.map(r => [r.request_id, r]));

      // Update only status and message cells (skip header row)
      for (let row = range.s.r + 1; row <= range.e.r; row++) {
        // Get request_id from current row
        const requestIdCell = worksheet[XLSX.utils.encode_cell({ r: row, c: requestIdColIndex })];
        const requestId = requestIdCell ? String(requestIdCell.v || '').trim() : '';

        const result = resultMap.get(requestId);
        if (result) {
          // Update status column
          const statusCellAddress = XLSX.utils.encode_cell({ r: row, c: statusColIndex });
          worksheet[statusCellAddress] = { t: 's', v: result.status };

          // Update message column
          const messageCellAddress = XLSX.utils.encode_cell({ r: row, c: messageColIndex });
          worksheet[messageCellAddress] = { t: 's', v: result.message };

          logger.debug(`Updated row ${row}: ${requestId} - Status: ${result.status}`);
        } else if (requestId) {
          logger.warn(`No result found for request_id: ${requestId}`);
        }
      }

      // Write back to file
      XLSX.writeFile(workbook, filePath);

      logger.info(`Excel file updated successfully with ${results.length} results - only status and message columns modified`);
    } catch (error) {
      logger.error(`Failed to update Excel file: ${error}`);
      throw error;
    }
  }

  static updateValidationErrors(filePath: string, errors: ValidationError[]): void {
    logger.info(`Updating Excel file with validation errors: ${filePath}`);

    try {
      const workbook = XLSX.readFile(filePath);
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];

      // Get the range of the worksheet
      const range = XLSX.utils.decode_range(worksheet['!ref'] || 'A1');

      // Find column indices for request_id, status, and message
      let requestIdColIndex = -1;
      let statusColIndex = -1;
      let messageColIndex = -1;

      // Read header row to find column positions
      for (let col = range.s.c; col <= range.e.c; col++) {
        const cellAddress = XLSX.utils.encode_cell({ r: 0, c: col });
        const cell = worksheet[cellAddress];
        const headerValue = cell?.v?.toString().toLowerCase() || '';

        if (headerValue === 'request_id') requestIdColIndex = col;
        if (headerValue === 'status') statusColIndex = col;
        if (headerValue === 'message') messageColIndex = col;
      }

      if (statusColIndex === -1 || messageColIndex === -1) {
        throw new Error('status and/or message columns not found in Excel');
      }

      // Group errors by request_id
      const errorMap = new Map<string, string[]>();
      errors.forEach(error => {
        if (!errorMap.has(error.request_id)) {
          errorMap.set(error.request_id, []);
        }
        errorMap.get(error.request_id)!.push(`${error.field}: ${error.error}`);
      });

      // Update rows with validation errors (skip header row)
      for (let row = range.s.r + 1; row <= range.e.r; row++) {
        // Get request_id from current row
        const requestIdCell = worksheet[XLSX.utils.encode_cell({ r: row, c: requestIdColIndex })];
        const requestId = requestIdCell ? String(requestIdCell.v || '').trim() : '';

        if (errorMap.has(requestId)) {
          const rowErrors = errorMap.get(requestId)!;
          // Update status column
          const statusCellAddress = XLSX.utils.encode_cell({ r: row, c: statusColIndex });
          worksheet[statusCellAddress] = { t: 's', v: 'VALIDATION_ERROR' };

          // Update message column with all errors for this row
          const messageCellAddress = XLSX.utils.encode_cell({ r: row, c: messageColIndex });
          worksheet[messageCellAddress] = { t: 's', v: rowErrors.join('; ') };

          logger.debug(`Updated row ${row}: ${requestId} - Status: VALIDATION_ERROR - Errors: ${rowErrors.join('; ')}`);
        }
      }

      // Write back to file
      XLSX.writeFile(workbook, filePath);

      logger.info(`Excel file updated successfully with ${errors.length} validation errors`);
    } catch (error) {
      logger.error(`Failed to update Excel file with validation errors: ${error}`);
      throw error;
    }
  }
}