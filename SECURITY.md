# Security policy

Version 1.x is the active portfolio development line. No response SLA or production certification is promised.

Do not put vulnerabilities, tokens, state, confidential hostnames/tfvars or private evidence in public issues. Before publishing, enable GitHub private vulnerability reporting and use **Security → Report a vulnerability**. Until a private channel exists, the maintainer must establish one before receiving confidential reports.

Include affected commit/version, prerequisites, authorized reproduction, impact and proposed remediation. Test only owned or explicitly authorized environments.

Expected invariants: no Azure DB public/password access, no runtime admin identity, closed SCM between operator sessions, certificate verification enabled, no GUI cloud-command executor and honest evidence labels. Weakening these requires documented review and updated acceptance tests.
