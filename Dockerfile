FROM node:18-alpine

# Create app directory
WORKDIR /app

# Install dependencies first for better caching
COPY package*.json ./
RUN npm install --production

# Copy application code
COPY . .

# Use non-root user for safety
RUN addgroup -S appgroup && adduser -S appuser -G appgroup
RUN chown -R appuser:appgroup /app
USER appuser

ENV PORT=3000
EXPOSE 3000

CMD ["node", "server/app.js"]
