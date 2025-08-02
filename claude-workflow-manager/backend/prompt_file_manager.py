import os
import re
import json
import yaml
from typing import List, Dict, Tuple, Optional
from pathlib import Path
import git
from models import Prompt, PromptStep, ExecutionMode
from datetime import datetime

class PromptFileManager:
    """
    Manages prompt files in git repositories using a naming convention:
    - Numeric prefix: Sequential execution order (1, 2, 3...)
    - Letter suffix: Parallel execution within the same numeric group (A, B, C...)
    - Descriptive name: Human-readable prompt purpose
    - Example: 1A-base-infrastructure.md, 2A_core_models.md, 2B-reference-models.md
    """
    
    PROMPTS_FOLDER = os.getenv("CLAUDE_PROMPTS_FOLDER", "claude_prompts")
    FILE_PATTERN = re.compile(r'^(\d+)([A-Z])[-_](.+)\.(md|yaml|json)$')
    
    def __init__(self, repo_path: str):
        self.repo_path = repo_path
        self.prompts_path = os.path.join(repo_path, self.PROMPTS_FOLDER)
        self.repo = git.Repo(repo_path)
        
    def ensure_prompts_folder(self):
        """Create prompts folder if it doesn't exist"""
        os.makedirs(self.prompts_path, exist_ok=True)
        
        # Create README if it doesn't exist
        readme_path = os.path.join(self.prompts_path, "README.md")
        if not os.path.exists(readme_path):
            with open(readme_path, 'w') as f:
                f.write("""# Planning Prompts

This folder contains planning prompts for Claude Code execution.

## Naming Convention

Files follow the pattern: `{number}{letter}-{description}.{ext}` or `{number}{letter}_{description}.{ext}`

- **Number**: Sequential execution order (1, 2, 3...)
- **Letter**: Parallel execution within the same numeric group (A, B, C...)
- **Separator**: Either `-` (hyphen) or `_` (underscore)
- **Description**: Human-readable prompt purpose
- **Extension**: .md (Markdown), .yaml, or .json

## Examples

- `1A-base-infrastructure.md` - First step, can run alone (hyphen style)
- `2A_core_models.md` - Second step, first parallel task (underscore style)
- `2B-reference-models.md` - Second step, runs parallel with 2A
- `3A_first_order_services.md` - Third step, depends on step 2 completion

## Execution Order

1. All prompts with the same number run in parallel
2. Higher numbers wait for lower numbers to complete
3. Within a number group, letters indicate parallel tasks
""")
    
    def parse_filename(self, filename: str) -> Optional[Tuple[int, str, str, str]]:
        """
        Parse a prompt filename into its components
        Returns: (sequence_number, parallel_letter, description, extension)
        """
        match = self.FILE_PATTERN.match(filename)
        if match:
            return int(match.group(1)), match.group(2), match.group(3), match.group(4)
        return None
    
    def generate_filename(self, prompt: Prompt, sequence: int, parallel: str = 'A') -> str:
        """Generate a filename for a prompt"""
        # Create kebab-case description from prompt name
        description = re.sub(r'[^a-zA-Z0-9\s-]', '', prompt.name)
        description = re.sub(r'\s+', '-', description).lower()
        
        return f"{sequence}{parallel}-{description}.md"
    
    def save_prompt_to_file(self, prompt: Prompt, sequence: int, parallel: str = 'A', 
                           commit: bool = True) -> str:
        """Save a prompt to a file in the repository"""
        self.ensure_prompts_folder()
        
        filename = self.generate_filename(prompt, sequence, parallel)
        filepath = os.path.join(self.prompts_path, filename)
        
        # Create markdown content
        content = f"""# {prompt.name}

{prompt.description}

## Metadata

- **Created**: {datetime.utcnow().isoformat()}
- **Tags**: {', '.join(prompt.tags)}
- **Detected Subagents**: {', '.join(prompt.detected_subagents)}

## Steps

"""
        
        for i, step in enumerate(prompt.steps, 1):
            content += f"""### Step {i} ({step.execution_mode})

{step.content}

"""
            if step.dependencies:
                content += f"**Dependencies**: {', '.join(step.dependencies)}\n\n"
            if step.subagent_refs:
                content += f"**Subagents**: {', '.join(step.subagent_refs)}\n\n"
        
        # Add YAML metadata at the end for programmatic access
        content += """
---
<!-- Prompt Metadata (Do not edit manually) -->
```yaml
prompt_id: {}
sequence: {}
parallel: "{}"
execution_groups: {}
```
""".format(
            prompt.id or 'generated',
            sequence,
            parallel,
            self._calculate_execution_groups(prompt)
        )
        
        # Write file
        with open(filepath, 'w') as f:
            f.write(content)
        
        # Commit to git if requested
        if commit:
            self.repo.index.add([filepath])
            self.repo.index.commit(f"Add prompt: {filename}")
        
        return filepath
    
    def load_prompts_from_repo(self) -> List[Dict]:
        """Load all prompts from the repository"""
        print(f"🔍 PROMPT DISCOVERY: Configured prompts folder: '{self.PROMPTS_FOLDER}'")
        print(f"📁 PROMPT DISCOVERY: Looking for prompts at: {self.prompts_path}")
        
        if not os.path.exists(self.prompts_path):
            print(f"❌ PROMPT DISCOVERY: Prompts folder not found: {self.prompts_path}")
            return []
        
        print(f"✅ PROMPT DISCOVERY: Found prompts folder: {self.prompts_path}")
        
        # List all files in the prompts directory
        all_files = sorted(os.listdir(self.prompts_path))
        print(f"📁 PROMPT DISCOVERY: Found {len(all_files)} files in prompts folder:")
        for f in all_files:
            file_path = os.path.join(self.prompts_path, f)
            file_type = 'file' if os.path.isfile(file_path) else 'directory'
            print(f"   - {f} ({file_type})")
        
        prompts = []
        
        for filename in all_files:
            if filename == "README.md":
                print(f"⏭️  PROMPT DISCOVERY: Skipping {filename} (README file)")
                continue
                
            parsed = self.parse_filename(filename)
            if not parsed:
                print(f"⏭️  PROMPT DISCOVERY: Skipping {filename} (doesn't match pattern {self.FILE_PATTERN.pattern})")
                continue
            
            print(f"📄 PROMPT DISCOVERY: Processing prompt file: {filename}")
                
            sequence, parallel, description, ext = parsed
            filepath = os.path.join(self.prompts_path, filename)
            
            # Read file content
            with open(filepath, 'r') as f:
                content = f.read()
            
            # Extract prompt data
            prompt_data = {
                'filename': filename,
                'sequence': sequence,
                'parallel': parallel,
                'description': description,
                'filepath': filepath,
                'content': content
            }
            
            # Try to extract structured data from YAML section
            yaml_match = re.search(r'```yaml\n(.*?)\n```', content, re.DOTALL)
            if yaml_match:
                try:
                    metadata = yaml.safe_load(yaml_match.group(1))
                    prompt_data.update(metadata)
                except:
                    pass
            
            prompts.append(prompt_data)
            print(f"✅ PROMPT DISCOVERY: Successfully processed: {filename}")
        
        print(f"🎯 PROMPT DISCOVERY: Total prompts loaded: {len(prompts)}")
        return prompts
    
    def get_execution_plan(self) -> List[List[Dict]]:
        """
        Get execution plan grouped by sequence number
        Returns list of parallel groups in execution order
        """
        prompts = self.load_prompts_from_repo()
        
        # Group by sequence number
        groups = {}
        for prompt in prompts:
            seq = prompt['sequence']
            if seq not in groups:
                groups[seq] = []
            groups[seq].append(prompt)
        
        # Sort groups by sequence and return as list
        execution_plan = []
        for seq in sorted(groups.keys()):
            execution_plan.append(sorted(groups[seq], key=lambda p: p['parallel']))
        
        return execution_plan
    
    def sync_prompts_to_repo(self, prompts: List[Prompt], auto_sequence: bool = True) -> Dict[str, str]:
        """
        Sync multiple prompts to the repository
        If auto_sequence is True, automatically assigns sequence numbers
        """
        self.ensure_prompts_folder()
        
        saved_files = {}
        
        if auto_sequence:
            # Group prompts by their execution dependencies
            execution_groups = self._group_prompts_by_dependencies(prompts)
            
            for seq_num, group in enumerate(execution_groups, 1):
                for parallel_idx, prompt in enumerate(group):
                    parallel_letter = chr(65 + parallel_idx)  # A, B, C...
                    filepath = self.save_prompt_to_file(
                        prompt, seq_num, parallel_letter, commit=False
                    )
                    saved_files[prompt.name] = filepath
        else:
            # Use manual sequencing based on prompt order
            for i, prompt in enumerate(prompts, 1):
                filepath = self.save_prompt_to_file(prompt, i, 'A', commit=False)
                saved_files[prompt.name] = filepath
        
        # Commit all changes at once
        if saved_files:
            self.repo.index.add(list(saved_files.values()))
            self.repo.index.commit(f"Sync {len(saved_files)} prompts to repository")
        
        return saved_files
    
    def _calculate_execution_groups(self, prompt: Prompt) -> List[List[str]]:
        """Calculate execution groups for a prompt's steps"""
        groups = []
        current_group = []
        
        for step in prompt.steps:
            if step.execution_mode == ExecutionMode.SEQUENTIAL:
                if current_group:
                    groups.append(current_group)
                    current_group = []
                groups.append([step.id])
            else:  # PARALLEL
                current_group.append(step.id)
        
        if current_group:
            groups.append(current_group)
        
        return groups
    
    def _group_prompts_by_dependencies(self, prompts: List[Prompt]) -> List[List[Prompt]]:
        """
        Group prompts by their dependencies for automatic sequencing
        This is a simplified version - in practice, you'd analyze prompt content
        """
        # For now, group prompts that have no dependencies together
        # and put dependent prompts in later groups
        groups = []
        
        # First pass: prompts with no detected subagents or dependencies
        first_group = []
        remaining = []
        
        for prompt in prompts:
            if not prompt.detected_subagents and all(
                not step.dependencies for step in prompt.steps
            ):
                first_group.append(prompt)
            else:
                remaining.append(prompt)
        
        if first_group:
            groups.append(first_group)
        
        # Second pass: group remaining prompts
        # In a real implementation, this would analyze dependencies
        if remaining:
            groups.append(remaining)
        
        return groups
    
    def delete_prompt_file(self, filename: str, commit: bool = True) -> bool:
        """Delete a prompt file from the repository"""
        filepath = os.path.join(self.prompts_path, filename)
        
        if not os.path.exists(filepath):
            return False
        
        os.remove(filepath)
        
        if commit:
            self.repo.index.remove([filepath])
            self.repo.index.commit(f"Remove prompt: {filename}")
        
        return True