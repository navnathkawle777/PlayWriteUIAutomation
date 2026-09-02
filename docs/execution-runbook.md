# Execution Runbook

## Pre-run checklist
1. Confirm approvals.
2. Confirm Newgen availability.
3. Confirm VPN or network access.
4. Confirm input Excel is approved.
5. Confirm automation account is active.
6. Confirm environment config.
7. Run dry-run validation.
8. Review validation report.

## UAT execution
npm run run:uat

## Production execution
npm run run:prod

## Post-run
1. Review summary report.
2. Review failed records.
3. Validate sample users manually.
4. Store evidence in approved location.
5. Send completion report.