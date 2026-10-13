# ADR 002: Evidence provenance

Status: accepted.

Context: visual security badges and synthetic events can falsely imply live protection.

Decision: label intent, offline simulation and indeterminate service-tag flows; observe only HTTP/database connectivity; mark checklist items self-attested. Export provenance. No fabricated detections or compliance scores.

Consequences: useful without Azure, but actual NSG/RBAC acceptance requires separate evidence. A future audit feature needs a scoped identity, API tests and data-access review.
