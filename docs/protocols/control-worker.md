# Core–worker protocol

Workers register identity, version, supported contract versions, capabilities, and capacity. Core leases compatible Jobs for a bounded period. Workers heartbeat leases, publish progress, and submit idempotent terminal results. Core remains authoritative for Task and Job state.

Network loss, duplicated messages, expired leases, and delayed results are normal protocol conditions. Tool side effects require stable idempotency keys where possible.
