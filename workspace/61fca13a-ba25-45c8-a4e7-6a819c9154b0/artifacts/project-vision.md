# Project Vision: secpass

## Overview
secpass is a lightweight, offline‑first command‑line password manager written in Rust. It stores all credentials in a single encrypted JSON vault located in the user’s data directory, protecting them with AES‑256‑GCM and a master key derived from a user‑supplied password via Argon2id. The tool is designed for both power users who script password operations and everyday users who prefer interactive prompts, delivering strong cryptographic guarantees while remaining simple to install and use.

## Key Features
- **Encrypted vault** – AES‑256‑GCM with per‑write random nonce; master key derived from Argon2id (64 MiB, 3 iterations).  
- **Rich CLI** – Sub‑commands for `init`, `add`, `get`, `list`, `delete`, `update`, `generate`, `import`, and `export` built with `clap 4.5`.  
- **Password generator** – Configurable length, character‑set toggles, exclusions, and a “strong” shortcut using the `password_generator` crate.  
- **Secure clipboard integration** – Automatically copy generated or retrieved passwords via `cli-clipboard`, with a `--no-clipboard` fallback.  
- **Concurrency safety** – Cross‑platform advisory file lock (`fd-lock`) guarantees atomic read‑modify‑write operations.  

## Technical Approach
The core data model is a Rust `struct PasswordEntry` containing service name, username, password, optional URL/notes, tags, and timestamps (created/updated). All entries are serialized to JSON with `serde`, then encrypted as a single blob. The vault file format consists of an unencrypted header (`MAGIC|VERSION|SALT|NONCE`) followed by the ciphertext, enabling straightforward version upgrades. File I/O uses atomic writes (temp file → `fsync` → rename) and retains a configurable number of timestamped backups. Errors are centralized in a `SecPassError` enum (via `thiserror`), providing clear user messages for incorrect master passwords, corrupted vaults, I/O failures, and validation issues. Interactive prompts fall back to `dialoguer` when required arguments are omitted, while a global `--no-interactive` flag ensures scriptability. Output is colour‑enhanced using `colored` but respects `NO_COLOR` and non‑TTY streams.

## Success Criteria
- [ ] Vault creation, encryption, and decryption succeed on Windows, macOS, and Linux without external dependencies.  
- [ ] All CLI commands operate correctly in both scripted (`--no-interactive`) and interactive modes.  
- [ ] Generated passwords meet configurable entropy requirements and can be copied to the system clipboard with graceful fallback.  
- [ ] Concurrent executions never corrupt the vault (verified by lock‑contention tests).  
- [ ] Import and export of encrypted JSON vaults work with conflict resolution based on `updated_at` timestamps.

## Scope Boundaries
**In Scope:**  
- Encrypted local storage, command‑line interface, password generation, clipboard support, import/export of encrypted JSON, interactive prompting, concurrency locking, comprehensive error handling, automated backups.

**Out of Scope:**  
- Cloud sync or remote storage, browser extensions, GUI front‑ends, integration with external password‑manager APIs, hardware security module (HSM) support, multi‑user sharing, advanced analytics on stored credentials.