# Newgen User Provisioning Automation Framework

## Purpose
This framework automates Newgen user creation, group assignment, and role association using approved Excel input.

## Key features
- Excel-driven execution
- Dry-run validation
- Configurable groups and roles
- Secure credential handling
- Screenshot, video, and trace evidence
- Structured logs
- Idempotent execution
- Resume from checkpoint
- UAT and Production configuration separation

## Execution modes
- DRY_RUN: validates input only
- UAT_RUN: executes against UAT
- PROD_RUN: executes against Production after approval

## Important
This framework must not bypass MFA, CAPTCHA, or Newgen security controls.