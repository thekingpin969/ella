# Stage Cache Directory

This directory contains JSON cache files for ELLA's planning workflow stage caching system.

## Structure

Each file corresponds to a project:
- **Filename:** `<projectId>.json`
- **Content:** Cached intermediate results for that project

## Example

See `example-project.json` for a sample cache file structure.

## Cache Keys

- `cache:gaps_generated` - Initial gap analysis
- `cache:confidence_calculated` - Initial confidence score
- `cache:gaps_filled` - Research results and filled gaps
- `cache:confidence_recalculated` - Updated confidence after research

## Management

### View Cache
```bash
cat .stage-cache/<projectId>.json
```

### Clear Specific Project Cache
```bash
rm .stage-cache/<projectId>.json
```

### Clear All Cache
```bash
rm -rf .stage-cache/*.json
# Keep example file
git checkout .stage-cache/example-project.json
```

## Important

⚠️ This cache is for **development/testing only**  
✅ Files are **gitignored** (except example)  
✅ Safe to delete anytime - will regenerate on next run  
📖 See `../docs/stage_caching.md` for full documentation
