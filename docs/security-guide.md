# Security Guide

## Access control
Use an approved automation account with least privilege.

## Credentials
Do not hardcode credentials.
Do not commit secrets into Git.
Do not store passwords in logs.

## Production controls
Production execution requires change approval and UAT sign-off.

## MFA and CAPTCHA
The automation must not bypass MFA, CAPTCHA, or security controls.
If MFA is required, use approved attended execution or approved service account pattern.