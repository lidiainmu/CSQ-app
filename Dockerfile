FROM node:22-bookworm

# Install bun
RUN curl -fsSL https://bun.sh/install | bash
ENV PATH="/root/.bun/bin:$PATH"

WORKDIR /app

# Install dependencies (separate layer for caching)
COPY package.json bun.lock bunfig.toml ./
RUN bun install --frozen-lockfile

# Install Playwright's Chromium + required system libraries
RUN bunx playwright install chromium --with-deps

# Copy source and build
COPY . .
RUN bun run build

EXPOSE 3000
CMD ["node", ".output/server/index.mjs"]
