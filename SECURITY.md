# Security Policy

## Reporting

Do not open public issues for vulnerabilities.  
Report security concerns privately to maintainers.

## Scope

Security-sensitive areas include:

1. Auth tokens and remote backend access paths
2. Secrets/signing/release workflows
3. Command execution and filesystem operations

## Handling Rules

1. Never commit secrets.
2. Keep CI secret scanning enabled.
3. Validate security-related changes with targeted review.

