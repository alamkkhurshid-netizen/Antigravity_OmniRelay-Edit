# Use the official Hermes Agent image as a base
FROM nousresearch/hermes-agent:latest

# Set working directory inside the container
WORKDIR /app

# Copy the custom configuration
COPY hermes-config.json /app/config.json

# Copy the Titan Syndicate Knowledge Base for RAG
# (Assuming Docker context is run from the repository root or we copy from relative path)
COPY ../app/knowledge/titans /app/data/knowledge

# Copy custom Python skills (like save_draft.py)
COPY skills /app/skills

# Ensure proper permissions and dependencies
RUN pip install requests

# Expose the API port
EXPOSE 8000

# Run the agent
CMD ["hermes-agent", "start", "--config", "/app/config.json"]
