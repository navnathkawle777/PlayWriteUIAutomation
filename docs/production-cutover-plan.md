# Production Cutover Plan

## Before execution
- Final input approved
- Change request approved
- Automation version frozen
- Evidence location confirmed
- Support contacts available

## During execution
- Run automation in monitored mode
- Track success and failure count
- Pause if failure threshold is exceeded

## Failure threshold
Stop execution if:
- Login fails
- More than 5 consecutive user creations fail
- Unexpected role or group assignment behaviour is observed
- Newgen portal becomes unstable

## After execution
- Generate final report
- Validate sample users
- Review failures
- Store evidence
- Close change record