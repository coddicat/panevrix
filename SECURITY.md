# Security

Panevrix runs with your local account's permissions and can read/write files, launch applications and execute commands. Keep it bound to `127.0.0.1`; do not proxy it onto a public network. It is a single-user local tool, not a multi-user service or filesystem sandbox.

API access uses a random per-process token, POST-only routes and localhost Host/origin checks. Browser responses use a restrictive content security policy. These controls do not protect against malicious software already running under the same account or every concurrent filesystem mutation. Do not run as administrator routinely.

Transfers do not overwrite existing files. Cancellation cleans incomplete output where possible, but task state is not persisted and sudden termination may leave partial files. Text saves are direct writes, not atomic. Panevrix Trash resides in system temporary storage and is not a backup. Maintain independent backups for valuable data.

Logs may contain private paths and error messages. Inspect and sanitize them before sharing. Shell commands are powerful; only run commands you understand. Permission helpers open OS controls and do not silently change ACLs, ownership or elevate privileges.

Report suspected vulnerabilities privately using GitHub's private vulnerability reporting on the repository if available. If that option is unavailable, request a private contact channel in a public issue without posting exploit details or private data. Include affected source/version, OS and reproduction using disposable data.
