# Solution Design

## Architecture
Input Excel -> Validation -> Provisioning Engine -> Newgen Adapter -> Evidence -> Report

## Design principles
- API-first where available
- UI automation fallback
- Idempotent execution
- Least privilege
- Evidence by design
- Config over code
- Secure credential handling
- Audit-ready reporting

## Components
1. Excel Reader
2. Validator
3. Config Loader
4. Newgen UI Adapter
5. Evidence Service
6. Report Service
7. Checkpoint Service
8. Logger