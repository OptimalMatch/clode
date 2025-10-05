# Seeding Orchestration Designs

## 🎉 Quick Start (Recommended: Use the UI Button)

The easiest way to seed sample orchestration designs is through the **UI**:

1. Open the web application
2. Navigate to **"Orchestration Designer"**
3. Click the **"Seed Samples"** button in the toolbar
4. Wait for the success message

That's it! The button will:
- ✅ Check if designs already exist
- ✅ Prevent duplicates automatically
- ✅ Show a success message with count
- ✅ Automatically refresh the design list

## Alternative Methods

### Method 1: API Endpoint (Programmatic)

```bash
# Seed sample designs
curl -X POST http://localhost:8000/api/orchestration-designs/seed

# Force seeding (even if designs exist)
curl -X POST "http://localhost:8000/api/orchestration-designs/seed?force=true"
```

**Response:**
```json
{
  "success": true,
  "message": "Successfully seeded 7 sample orchestration designs",
  "existing_count": 0,
  "seeded_count": 7,
  "total_count": 7
}
```

### Method 2: Command Line Script

From the backend directory:

```bash
cd claude-workflow-manager/backend
python seed_orchestration_designs.py
```

**Protection:** The script checks if designs already exist and won't create duplicates unless you use `--force`:

```bash
python seed_orchestration_designs.py --force
```

## Expected Behavior

### First Seeding (Empty Database)
```
✅ Success! 
Successfully seeded 7 sample designs!
```

### Subsequent Attempts (Protected)
```
⚠️ Already Exists
Sample designs already exist (7 found). Use force=true to add anyway.
```

## Integration Scenarios

### Docker Container
If running in Docker, you can trigger via API:

```bash
# From host machine
curl -X POST http://localhost:8000/api/orchestration-designs/seed

# Or exec into container
docker exec -it <backend-container> python seed_orchestration_designs.py
```

### Docker Compose Startup
Add to `docker-compose.yml` or startup script:

```yaml
services:
  backend:
    # ... other config
    command: |
      sh -c "
        # Wait for MongoDB
        sleep 5
        # Optional: Seed on first startup
        python seed_orchestration_designs.py || true
        # Start the server
        uvicorn main:app --host 0.0.0.0 --port 8000
      "
```

### GitHub Actions / CI/CD
```yaml
- name: Seed Sample Designs
  run: |
    curl -X POST http://localhost:8000/api/orchestration-designs/seed
```

## What Gets Seeded

| Design Name | Blocks | Agents | Connections | Patterns Used | Showcases |
|-------------|--------|--------|-------------|---------------|-----------|
| Data Processing Pipeline | 1 | 3 | 0 | Sequential | Basic workflow |
| Multi-Domain Analysis | 2 | 5 | 1 | Sequential, Parallel | Parallel processing + aggregation |
| Automated Code Review System | 1 | 5 | 0 | Hierarchical | Manager/worker delegation |
| Technical Decision Framework | 2 | 3 | 1 | Debate, Sequential | Adversarial reasoning |
| Customer Support Routing System | 5 | 6 | 4 | Sequential, Router | Conditional branching |
| Research Paper Analysis Pipeline | 3 | 9 | 4 | Sequential, Parallel, Hierarchical | **Agent-level connections** |
| Full-Stack Development Workflow | 4 | 11 | 3 | Debate, Parallel, Hierarchical, Sequential | Complete multi-stage cycle |

**Total:** 7 designs, 16 blocks, 42 agents, 13 connections

## API Endpoint Details

### POST `/api/orchestration-designs/seed`

**Query Parameters:**
- `force` (boolean, optional): If `true`, seeds even if designs already exist. Default: `false`

**Response:**
```typescript
{
  success: boolean;
  message: string;
  existing_count: number;
  seeded_count: number;
  total_count?: number;
}
```

**Status Codes:**
- `200 OK`: Seeding successful or skipped (check `success` field)
- `500 Internal Server Error`: Seeding failed

## Verifying the Seed

### Via UI (Easiest)
1. Navigate to "Orchestration Designer"
2. Click "Load Design"
3. You should see 7 sample designs

### Via API
```bash
curl http://localhost:8000/api/orchestration-designs
```

### Via Database
```bash
mongosh
use claude_workflow_db
db.orchestration_designs.countDocuments()
# Should return 7 (or more if other designs exist)
```

## Troubleshooting

### Button shows "Already exists" message
**Solution:** Designs are already seeded! Click "Load Design" to view them.

### API returns "already exist" 
**Solution:** This is expected behavior. Designs are protected from duplication. Use `force=true` only if you want duplicates.

### Error: "Failed to seed designs"
**Solutions:**
1. Check MongoDB is running: `docker ps | grep mongo`
2. Check backend logs for details
3. Verify database connection in environment variables
4. Try the command-line script for detailed error output:
   ```bash
   python seed_orchestration_designs.py
   ```

### Designs not showing in UI
**Solutions:**
1. Click "Load Design" button (don't just refresh)
2. Check browser console for errors
3. Verify API works: `curl http://localhost:8000/api/orchestration-designs`
4. Check network tab for failed requests

### ModuleNotFoundError when using CLI
**Solution:** Ensure you're in the backend directory:
```bash
cd claude-workflow-manager/backend
python seed_orchestration_designs.py
```

## Removing Sample Designs

### Via UI (Future)
When delete functionality is added to the UI, you can remove designs individually.

### Via API
```bash
# Get all designs
curl http://localhost:8000/api/orchestration-designs

# Delete each by ID
curl -X DELETE http://localhost:8000/api/orchestration-designs/<design-id>
```

### Via MongoDB
```bash
mongosh
use claude_workflow_db
# Remove all designs
db.orchestration_designs.deleteMany({})
# Or remove only sample designs (if you can identify them)
db.orchestration_designs.deleteMany({"name": {"$in": [
  "Data Processing Pipeline",
  "Multi-Domain Analysis",
  "Automated Code Review System",
  "Technical Decision Framework",
  "Customer Support Routing System",
  "Research Paper Analysis Pipeline",
  "Full-Stack Development Workflow"
]}})
```

## Best Practices

✅ **DO:**
- Use the UI button for the easiest experience
- Seed once after deployment
- Use samples to learn the system
- Customize samples for your needs

❌ **DON'T:**
- Use `force=true` in production (creates duplicates)
- Rely on samples for critical workflows
- Delete the seed script (keep for reference)
- Run seed on every server restart

## Command Line Options (Script)

### Normal Run
```bash
python seed_orchestration_designs.py
```
Checks for existing designs and prompts before seeding.

### Force Mode
```bash
python seed_orchestration_designs.py --force
# or
python seed_orchestration_designs.py -f
```
Seeds even if designs already exist (creates duplicates).

## Related Documentation

- `SAMPLE_ORCHESTRATION_DESIGNS.md` - Detailed explanation of each design
- `SAMPLE_DESIGNS_IMPROVEMENTS.md` - Prompt engineering patterns used
- `AGENT_CONNECTION_SYSTEM.md` - Agent-level connection documentation

## UI Button Location

```
Toolbar: [Zoom Controls] | [Load Design] [Seed Samples] [Save Design] [Execute]
                                            ↑
                                  Click here to seed!
```

**Visual Feedback:**
- Button shows "Seeding..." with spinner while working
- Success: Green notification with count
- Error: Red notification with details
- Designs list auto-refreshes on success

## Support

If you encounter issues:
1. Try the UI button first (simplest)
2. Check the API endpoint directly
3. Review backend server logs
4. Try the command-line script for detailed output
5. Verify MongoDB connection and status
